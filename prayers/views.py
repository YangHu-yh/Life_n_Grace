from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from .models import Prayer
from .repository import get_repository
from .forms import PrayerForm, AIPrayerPromptForm
from .apologist_client import (
    get_ai_prayer_suggestion,
    generate_prayer_from_existing,
    get_prayer_topics,
    get_bible_verses_for_topic,
    get_short_prayer_for_topic,
    get_model,
    PRAYER_TOPICS,
)
import random
import logging

logger = logging.getLogger(__name__)

@login_required
def prayer_list_view(request):
    repo = get_repository()
    prayers = repo.list_prayers()
    
    # For storing any generated prayer that hasn't been saved yet
    generated_prayer = None
    generated_references = None
    
    if 'generated_prayer' in request.session:
        generated_prayer = request.session.pop('generated_prayer')
        generated_references = request.session.pop('generated_references', '')
    
    context = {
        'prayers': prayers,
        'prayer_form': PrayerForm(),
        'ai_prompt_form': AIPrayerPromptForm(),
        'prayer_topics': get_prayer_topics(),
        'generated_prayer': generated_prayer,
        'generated_references': generated_references,
    }
    return render(request, 'prayers/prayer_list.html', context)

@login_required
def add_prayer_view(request):
    repo = get_repository()
    if request.method == 'POST':
        form = PrayerForm(request.POST)
        if form.is_valid():
            repo.create_prayer(
                text=form.cleaned_data['text'],
                status=form.cleaned_data.get('status', 'new')
            )
            return redirect('prayer_list')
    # This view will primarily be part of the prayer_list_view page, 
    # but a separate POST handler is good practice.
    # If form is invalid or it's a GET, redirect to list view which displays forms.
    return redirect('prayer_list')

@login_required
def suggest_ai_prayer_view(request):
    if request.method == 'POST':
        # Enforce per-user daily quota before any API call
        today = timezone.now().date()
        repo = get_repository()
        used = 0
        try:
            used = repo.get_daily_quota(request.user.id, today)
        except Exception:
            used = 0
        if used >= 10:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': False, 'error': 'Daily AI generation quota reached.'}, status=429)
            return redirect('prayer_list')
        ai_form = AIPrayerPromptForm(request.POST)
        if ai_form.is_valid():
            prompt = ai_form.cleaned_data['prompt']
            word_count = request.POST.get('word_count', 'medium')
            suggested_text, references = get_ai_prayer_suggestion(prompt, word_count)
            
            if suggested_text:
                try:
                    repo.increment_daily_quota(request.user.id, today)
                except Exception:
                    pass
                # Check if this is an AJAX request
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return JsonResponse({
                        'success': True,
                        'prayer': suggested_text,
                        'references': references
                    })
                else:
                    # Store in session for non-AJAX requests
                    request.session['generated_prayer'] = suggested_text
                    request.session['generated_references'] = references
                    return redirect('prayer_list')
            else:
                # Handle error: AI suggestion failed
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return JsonResponse({
                        'success': False,
                        'error': references
                    })
                else:
                    logger.error("AI suggestion failed. detail=%s", references)
                    return redirect('prayer_list')
    
    # If we get here, it's either not a POST request or the form is invalid
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': False, 'error': 'Invalid form or request'})
    return redirect('prayer_list')

@require_POST
@login_required
def delete_prayer_view(request, prayer_id):
    repo = get_repository()
    repo.delete_prayer(str(prayer_id))
    # Optionally, add a success message using Django's messages framework here
    # messages.success(request, 'Prayer deleted successfully!')
    return redirect('prayer_list')

@require_POST
@login_required
def mark_as_prayed_over_view(request, prayer_id):
    repo = get_repository()
    repo.increment_prayed_over(str(prayer_id))
    # Optionally, add a success message
    # messages.success(request, f'Marked "{prayer.text[:30]}..." as prayed over.')
    return redirect('prayer_list')

@require_POST
@login_required
def update_prayer_status_view(request, prayer_id):
    repo = get_repository()
    new_status = request.POST.get('status')
    
    # Validate the new status
    if new_status in dict(Prayer.PRAYER_STATUS_CHOICES).keys():
        repo.update_status(str(prayer_id), new_status)
        # Optionally, add a success message
        # messages.success(request, f'Updated prayer status to "{prayer.get_status_display()}"')
    
    return redirect('prayer_list')

@require_POST
@login_required
def generate_from_existing_view(request, prayer_id, length='medium'):
    """Generate a new prayer based on an existing one"""
    # For DynamoDB mode, we read text directly via ORM for source text
    # since generate_from_existing creates a new entry via repo
    prayer = get_object_or_404(Prayer, id=prayer_id)
    
    # Validate length parameter
    if length not in ['short', 'medium', 'long']:
        length = 'medium'
    
    # Enforce per-user daily quota before any API call
    today = timezone.now().date()
    repo = get_repository()
    used = 0
    try:
        used = repo.get_daily_quota(request.user.id, today)
    except Exception:
        used = 0
    if used >= 10:
        return redirect('prayer_list')

    suggested_text, references = generate_prayer_from_existing(prayer.text, length)
    
    if suggested_text:
        # Create a new prayer based on the generated text
        repo.create_prayer(
            text=suggested_text,
            is_ai_generated=True,
            ai_generation_references=references,
            status='new'
        )
        try:
            repo.increment_daily_quota(request.user.id, today)
        except Exception:
            pass
    
    return redirect('prayer_list')

@login_required
def prayer_topics_view(request):
    """Return a JSON list of prayer topics"""
    topics = list(get_prayer_topics().keys())
    return JsonResponse({'topics': topics})

def get_random_topic():
    """Return a random topic from the available prayer topics"""
    topics = list(get_prayer_topics().keys())
    return random.choice(topics)

@login_required
def topic_prayer_preview(request, topic=None):
    """Generate a short prayer preview for a topic, optionally choose a random topic"""
    # If no topic provided, choose a random one
    if topic is None or topic == 'random':
        topic = get_random_topic()
    
    # Check if the topic exists
    prayer_topics = get_prayer_topics()
    if topic not in prayer_topics:
        return JsonResponse({'error': 'Topic not found'}, status=404)
    
    # Get verses for this topic and select one
    verses = get_bible_verses_for_topic(topic)
    selected_verse = random.choice(verses) if verses else ""

    # If the AI model isn't configured, provide a graceful local fallback
    script_name = request.META.get('SCRIPT_NAME', '')
    if topic not in PRAYER_TOPICS:
        return JsonResponse({'error': 'Topic not found'}, status=404)
    try:
        apologist_model = get_model()
    except Exception as e:
        apologist_model = None
    if not apologist_model:
        base = f"a short prayer for '{topic}'"
        verse_ref = selected_verse.split(' - ')[0] if selected_verse else None
        prayer_text = (
            f"Heavenly Father, we seek your presence in this time. Grant us {topic.lower()} "
            f"and help us to trust in your unfailing love. Guide our hearts and minds, and "
            f"fill us with peace and courage today. Amen."
        )
        references = (
            f"Sample prayer for '{topic}' based on {verse_ref}"
            if verse_ref else f"Sample prayer for '{topic}'"
        )
        return JsonResponse({
            'success': True,
            'topic': topic,
            'verse': selected_verse,
            'prayer': prayer_text,
            'references': references,
            'topic_url': f"{script_name}/prayers/topic_prayer/{topic}/",
            'notice': 'AI is unavailable right now. Showing a default prayer.',
        })
    
    try:
        # Use the already selected verse for the prayer generation
        full_prompt = f"""Create a short prayer (50-70 words) for the topic "{topic}" 
that incorporates the essence of this Bible verse: {selected_verse}."""
        
        response = apologist_model.generate_content(full_prompt)
        
        if hasattr(response, 'text'):
            prayer_text = response.text
        elif response.parts:
            prayer_text = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
        else:
            if response.candidates and response.candidates[0].content.parts:
                prayer_text = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
            else:
                prayer_text = "Could not generate a prayer at this time."
        
        # Generate a reference that includes the specific verse used
        references = f"AI-generated short prayer for '{topic}' based on {selected_verse.split(' - ')[0]}"
    
    except Exception as e:
        logger.exception("Error generating topic prayer preview")
        # Fallback on any generation error as well
        verse_ref = selected_verse.split(' - ')[0] if selected_verse else None
        prayer_text = (
            f"Lord, in this moment we ask for your help with {topic.lower()}. "
            f"Strengthen us and steady our hearts. Amen."
        )
        references = (
            f"Fallback prayer for '{topic}' based on {verse_ref}"
            if verse_ref else f"Fallback prayer for '{topic}'"
        )
        return JsonResponse({
            'success': True,
            'topic': topic,
            'verse': selected_verse,
            'prayer': prayer_text,
            'references': references,
            'topic_url': f"{script_name}/prayers/topic_prayer/{topic}/",
            'notice': 'Failed to connect to AI. Please try again later.',
        })
    
    # Return JSON response with the preview data
    return JsonResponse({
        'success': True,
        'topic': topic,
        'verse': selected_verse,
        'prayer': prayer_text,
        'references': references,
        'topic_url': f"{script_name}/prayers/topic_prayer/{topic}/",
    })

@login_required
def topic_prayer_view(request, topic):
    """Generate a short prayer based on the selected topic"""
    # URL encode the topic when it comes in (spaces become %20, etc.)
    # So we need to use the topic as is, since Django's URL resolver
    # has already decoded it
    
    # Check if the topic exists
    prayer_topics = get_prayer_topics()
    if topic not in prayer_topics:
        return JsonResponse({'error': 'Topic not found'}, status=404)
    
    # Get Bible verses for this topic
    verses = get_bible_verses_for_topic(topic)
    
    # For AJAX requests, just return a new prayer with existing verses
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        # Select a verse
        selected_verse = random.choice(verses) if verses else ""
        
        # Generate prayer using the selected verse
        apologist_model = get_model()
        if not apologist_model:
            # Fallback prayer JSON to avoid HTML error pages
            fallback_text = (
                f"Lord, we seek Your guidance for {topic.lower()}. Grant wisdom and peace. Amen."
            )
            verse_ref = selected_verse.split(' - ')[0] if selected_verse else None
            references = (
                f"Fallback prayer for '{topic}' based on {verse_ref}"
                if verse_ref else f"Fallback prayer for '{topic}'"
            )
            return JsonResponse({
                'topic': topic,
                'verse': selected_verse,
                'prayer': fallback_text,
                'references': references,
                'notice': 'AI is unavailable right now. Showing a default prayer.'
            })
        try:
            # Use the selected verse for the prayer generation
            full_prompt = f"""Create a short prayer (50-70 words) for the topic "{topic}" 
that incorporates the essence of this Bible verse: {selected_verse}."""
            
            response = apologist_model.generate_content(full_prompt)
            
            if hasattr(response, 'text'):
                prayer_text = response.text
            elif response.parts:
                prayer_text = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
            else:
                if response.candidates and response.candidates[0].content.parts:
                    prayer_text = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
                else:
                    prayer_text = "Could not generate a prayer at this time."
            
            # Generate a reference that includes the specific verse used
            references = f"AI-generated short prayer for '{topic}' based on {selected_verse.split(' - ')[0]}"
            
            # Return JSON with the prayer and the specific verse used
            return JsonResponse({
                'topic': topic,
                'verse': selected_verse,  # Send back just the selected verse
                'prayer': prayer_text,
                'references': references
            })
            
        except Exception as e:
            logger.exception("Error generating topic prayer (AJAX)")
            fallback_text = (
                f"Merciful God, help us in the area of {topic.lower()}. Strengthen our faith. Amen."
            )
            verse_ref = selected_verse.split(' - ')[0] if selected_verse else None
            references = (
                f"Fallback prayer for '{topic}' based on {verse_ref}"
                if verse_ref else f"Fallback prayer for '{topic}'"
            )
            return JsonResponse({
                'topic': topic,
                'verse': selected_verse,
                'prayer': fallback_text,
                'references': references,
                'notice': 'Failed to connect to AI. Showing a default prayer.'
            })
    
    # For non-AJAX requests (initial page load), select a verse and generate a prayer
    selected_verse = random.choice(verses) if verses else ""
    
    # Get additional Bible verses related to the topic
    additional_verses = []
    apologist_model_for_additional_verses = get_model()
    if apologist_model_for_additional_verses:
        try:
            prompt = f"""Provide 7 more Bible verses related to the topic of "{topic}". 
Format each as "Book Chapter:Verse - The verse text." 
Use different books and chapters for variety. Don't include any explanations, just the verses."""
            
            response = apologist_model_for_additional_verses.generate_content(prompt)
            
            if hasattr(response, 'text'):
                verses_text = response.text
            elif response.parts:
                verses_text = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
            else:
                if response.candidates and response.candidates[0].content.parts:
                    verses_text = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
                else:
                    verses_text = ""
            
            # Process the text to extract verses
            if verses_text:
                for line in verses_text.strip().split('\n'):
                    line = line.strip()
                    # Skip empty lines, code blocks, headings, and explanatory text
                    if not line or line.startswith('```') or line.startswith('#') or line.startswith('Okay') or line.startswith('Here'):
                        continue
                    
                    # Remove numbering like "1." or "1)" or "1 -" at the beginning of the line
                    line = line.lstrip('0123456789.)-[] ')
                    
                    # Remove any "- " prefix since we're adding that in the template
                    if line.startswith('- '):
                        line = line[2:]
                    
                    if line:  # Only add non-empty lines
                        additional_verses.append(line)
        except Exception:
            logger.exception("Error getting additional verses")
    
    # Combine original verses with additional ones, but don't exceed 10 total
    all_verses = verses.copy()
    for verse in additional_verses:
        if verse not in all_verses and len(all_verses) < 10:
            all_verses.append(verse)
    
    # Generate prayer using the selected verse
    apologist_model = get_model()
    if not apologist_model:
        prayer_text = "Prayer generation is currently unavailable. Please try again later."
        references = "API not available"
    else:
        try:
            # Use the selected verse for the prayer generation
            full_prompt = f"""Create a short prayer (50-70 words) for the topic "{topic}" 
that incorporates the essence of this Bible verse: {selected_verse}."""
            
            response = apologist_model.generate_content(full_prompt)
            
            if hasattr(response, 'text'):
                prayer_text = response.text
            elif response.parts:
                prayer_text = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
            else:
                if response.candidates and response.candidates[0].content.parts:
                    prayer_text = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
                else:
                    prayer_text = "Could not generate a prayer at this time."
            
            # Generate a reference that includes the specific verse used
            references = f"AI-generated short prayer for '{topic}' based on {selected_verse.split(' - ')[0]}"
            
        except Exception:
            logger.exception("Error generating topic prayer (page)")
            prayer_text = "An error occurred while generating the prayer. Please try again."
            references = f"Error: {str(e)}"
    
    # If user wants to save this prayer, create it
    if prayer_text and request.method == 'POST' and request.POST.get('save_prayer'):
        Prayer.objects.create(
            text=prayer_text, 
            is_ai_generated=True, 
            ai_generation_references=references,
            status='new' 
        )
        return redirect('prayer_list')
    
    # Otherwise render a page showing the topic, selected verse, and prayer
    context = {
        'topic': topic,
        'verse': selected_verse,  # Pass only the selected verse, not all verses
        'verses': all_verses,  # Pass all verses for the topic including additional ones
        'prayer': prayer_text,
        'references': references
    }
    return render(request, 'prayers/topic_prayer.html', context)

@require_POST
@login_required
def save_generated_prayer(request):
    if request.method == 'POST':
        prayer_text = request.POST.get('prayer_text')
        references = request.POST.get('references')
        status = request.POST.get('status', 'new')
        
        if prayer_text:
            Prayer.objects.create(
                text=prayer_text,
                is_ai_generated=True,
                ai_generation_references=references,
                status=status
            )
            
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': False, 'error': 'Invalid request'})
    return redirect('prayer_list')

@login_required
def profile_view(request):
    user = request.user
    context = {
        'user_obj': user,
    }
    return render(request, 'profile.html', context)

# TODO:
# - View for updating prayer status (e.g., moving in Kanban)
# - View for incrementing 'clicked_as_prayed_over_count'
# - More sophisticated Kanban display logic in prayer_list_view or a new view
