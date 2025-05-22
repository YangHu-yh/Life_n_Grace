import google.generativeai as genai
import os
import random

# Load the API key from environment variables
# The user will need to set GOOGLE_API_KEY in their environment
API_KEY = os.getenv("GOOGLE_API_KEY")

# Configure the genai library with the API key
# It's better to do this once, ideally when the app starts,
# but for this client file, we can do it here.
# Handle the case where API_KEY might not be set.
if API_KEY:
    genai.configure(api_key=API_KEY)
    # Initialize the model
    # Ensure you use a model that's available and suitable for text generation.
    # 'gemini-2.0-flash' is the new default.
    model = genai.GenerativeModel('gemini-2.0-flash')
else:
    model = None # Or handle this by raising an error or logging a warning

# Common prayer topics with associated Bible verses
PRAYER_TOPICS = {
    "Strength and Courage": [
        "Joshua 1:9 - Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.",
        "Isaiah 41:10 - So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.",
        "Philippians 4:13 - I can do all this through him who gives me strength."
    ],
    "Healing and Health": [
        "Jeremiah 30:17 - But I will restore you to health and heal your wounds, declares the LORD.",
        "James 5:14-15 - Is anyone among you sick? Let them call the elders of the church to pray over them and anoint them with oil in the name of the Lord. And the prayer offered in faith will make the sick person well; the Lord will raise them up.",
        "Psalm 103:2-3 - Praise the LORD, my soul, and forget not all his benefits—who forgives all your sins and heals all your diseases."
    ],
    "Guidance and Direction": [
        "Proverbs 3:5-6 - Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
        "Psalm 32:8 - I will instruct you and teach you in the way you should go; I will counsel you with my loving eye on you.",
        "John 16:13 - But when he, the Spirit of truth, comes, he will guide you into all the truth."
    ],
    "Gratitude and Thanksgiving": [
        "1 Thessalonians 5:16-18 - Rejoice always, pray continually, give thanks in all circumstances; for this is God's will for you in Christ Jesus.",
        "Psalm 107:1 - Give thanks to the LORD, for he is good; his love endures forever.",
        "Colossians 3:17 - And whatever you do, whether in word or deed, do it all in the name of the Lord Jesus, giving thanks to God the Father through him."
    ],
    "Peace and Comfort": [
        "John 14:27 - Peace I leave with you; my peace I give you. I do not give to you as the world gives. Do not let your hearts be troubled and do not be afraid.",
        "Philippians 4:6-7 - Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.",
        "Psalm 34:18 - The LORD is close to the brokenhearted and saves those who are crushed in spirit."
    ],
    "Wisdom and Knowledge": [
        "James 1:5 - If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.",
        "Proverbs 2:6 - For the LORD gives wisdom; from his mouth come knowledge and understanding.",
        "Colossians 1:9-10 - We continually ask God to fill you with the knowledge of his will through all the wisdom and understanding that the Spirit gives."
    ],
    "Family and Relationships": [
        "Ephesians 4:2-3 - Be completely humble and gentle; be patient, bearing with one another in love. Make every effort to keep the unity of the Spirit through the bond of peace.",
        "Colossians 3:13-14 - Bear with each other and forgive one another if any of you has a grievance against someone. Forgive as the Lord forgave you. And over all these virtues put on love, which binds them all together in perfect unity.",
        "1 Peter 4:8 - Above all, love each other deeply, because love covers over a multitude of sins."
    ]
}

def get_prayer_topics():
    """
    Returns the available prayer topics.
    """
    return PRAYER_TOPICS

def get_bible_verses_for_topic(topic):
    """
    Returns Bible verses for a specific topic.
    """
    return PRAYER_TOPICS.get(topic, [])

def get_ai_prayer_suggestion(prompt_text: str, word_count: str = "medium") -> tuple[str | None, str | None]:
    """
    Generates a prayer suggestion based on the prompt_text using the Gemini API.

    Args:
        prompt_text: The input text to base the prayer suggestion on.
        word_count: "short" (0-100 words), "medium" (100-200 words), or "long" (200-500 words)

    Returns:
        A tuple containing the suggested prayer (str) and references (str).
        Returns (None, "API Key not configured or model not initialized.") if the API is not available.
        Returns (None, "Error message") if generation fails.
    """
    if not model:
        print("Gemini API key not configured or model not initialized.")
        return None, "Gemini API key not configured or model not initialized."

    try:
        # Define word count ranges
        count_ranges = {
            "short": "0-100 words",
            "medium": "100-200 words",
            "long": "200-500 words"
        }
        
        word_range = count_ranges.get(word_count, count_ranges["medium"])
        
        # Construct a more specific prompt for prayer generation
        full_prompt = f"""Generate a prayer suggestion based on the following topic or need: "{prompt_text}". 
The prayer should be comforting, inspirational, and approximately {word_range} in length.
Include appropriate references to Scripture where relevant."""
        
        response = model.generate_content(full_prompt)
        
        # Accessing the text from the response.
        # Depending on the API version and response structure, this might need adjustment.
        if response.parts:
            suggested_prayer = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
        elif hasattr(response, 'text'):
             suggested_prayer = response.text
        else:
            # Fallback if the expected text attribute isn't found or parts are empty
            # This might indicate an issue with the response or an unexpected format.
            print("Warning: Could not extract text from Gemini response using standard attributes.")
            # Attempt to access candidates if available (common in more complex scenarios)
            if response.candidates and response.candidates[0].content.parts:
                suggested_prayer = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
            else:
                suggested_prayer = "Could not parse the prayer suggestion from the AI response."

        references = f"AI-generated based on the prompt: \"{prompt_text[:150]}{'...' if len(prompt_text) > 150 else ''}\" ({word_range})."
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating prayer suggestion via Gemini: {e}")
        return None, f"Error during AI generation: {str(e)}"

def generate_prayer_from_existing(prayer_text: str, word_count: str = "medium") -> tuple[str | None, str | None]:
    """
    Generates a new prayer based on an existing prayer, with optional length specification.
    
    Args:
        prayer_text: The existing prayer text to base the new one on.
        word_count: "short" (0-100 words), "medium" (100-200 words), or "long" (200-500 words)
        
    Returns:
        A tuple containing the suggested prayer (str) and references (str).
    """
    if not model:
        print("Gemini API key not configured or model not initialized.")
        return None, "Gemini API key not configured or model not initialized."
    
    try:
        # Define word count ranges
        count_ranges = {
            "short": "0-100 words",
            "medium": "100-200 words",
            "long": "200-500 words"
        }
        
        word_range = count_ranges.get(word_count, count_ranges["medium"])
        
        full_prompt = f"""Based on the following prayer:

"{prayer_text}"

Create a new, unique prayer that maintains the theme, intention and spirit of the original, 
but with different wording and structure. The new prayer should be approximately {word_range} in length.
Include appropriate references to Scripture where relevant."""
        
        response = model.generate_content(full_prompt)
        
        if response.parts:
            suggested_prayer = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
        elif hasattr(response, 'text'):
             suggested_prayer = response.text
        else:
            if response.candidates and response.candidates[0].content.parts:
                suggested_prayer = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
            else:
                suggested_prayer = "Could not parse the prayer suggestion from the AI response."

        references = f"AI-generated based on an existing prayer ({word_range})."
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating prayer from existing via Gemini: {e}")
        return None, f"Error during AI generation: {str(e)}"

def get_short_prayer_for_topic(topic: str) -> tuple[str | None, str | None]:
    """
    Generates a short prayer suggestion for a given topic.
    
    Args:
        topic: The prayer topic (e.g., "Strength and Courage").
        
    Returns:
        A tuple containing the suggested prayer (str) and references (str).
    """
    if not model or topic not in PRAYER_TOPICS:
        return None, "Topic not recognized or API not available."
    
    try:
        verses = PRAYER_TOPICS[topic]
        selected_verse = random.choice(verses)
        
        full_prompt = f"""Create a short prayer (50-70 words) for the topic "{topic}" 
that incorporates the essence of this Bible verse: {selected_verse}."""
        
        response = model.generate_content(full_prompt)
        
        if response.parts:
            suggested_prayer = ''.join(part.text for part in response.parts if hasattr(part, 'text'))
        elif hasattr(response, 'text'):
             suggested_prayer = response.text
        else:
            if response.candidates and response.candidates[0].content.parts:
                suggested_prayer = ''.join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))
            else:
                suggested_prayer = "Could not parse the prayer suggestion."

        references = f"AI-generated short prayer for '{topic}' based on {selected_verse.split(' - ')[0]}"
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating short prayer for topic: {e}")
        return None, f"Error during AI generation: {str(e)}"

# Example of how to use (can be commented out or removed for production)
# if __name__ == '__main__':
#     if API_KEY: # Only run if API_KEY is present
#         print("Attempting to get an AI prayer suggestion...")
#         suggestion, refs = get_ai_prayer_suggestion("Guidance for making a difficult decision.")
#         if suggestion:
#             print("\nSuggested Prayer:")
#             print(suggestion)
#             print("\nReferences:")
#             print(refs)
#         else:
#             print(f"Could not retrieve suggestion. Reference/Error: {refs}")
#     else:
#         print("GOOGLE_API_KEY is not set. Skipping example usage of gemini_client.") 