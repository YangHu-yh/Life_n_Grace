from django import forms
from .models import Prayer

class PrayerForm(forms.ModelForm):
    class Meta:
        model = Prayer
        fields = ['text', 'status'] # Users can set text and initial status
        widgets = {
            'text': forms.Textarea(attrs={'rows': 4, 'placeholder': 'What is your prayer need?'}),
        }

class AIPrayerPromptForm(forms.Form):
    prompt = forms.CharField(
        label="What topic or need would you like an AI-generated prayer for?", 
        widget=forms.Textarea(attrs={'rows': 3, 'placeholder': 'Enter your prayer request here'})
    ) 