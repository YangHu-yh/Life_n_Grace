from django.db import models
from django.utils import timezone

class Prayer(models.Model):
    PRAYER_STATUS_CHOICES = [
        ('new', 'New'),
        ('praying', 'Praying'),
        ('accomplished', 'Accomplished'),
        ('changed_or_no_longer_needed', 'Changed or No longer Needed'),
    ]

    text = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    # How many times similar prayers have been prayed for - This might be complex to implement accurately
    # without a more sophisticated similarity search or manual linking.
    # For now, we'll skip this or consider a simplified approach later.
    
    clicked_as_prayed_over_count = models.PositiveIntegerField(default=0)
    
    # How long has it been created - This can be a derived property, not a stored field.
    
    has_been_changed = models.BooleanField(default=False) # Will be set to True if text is modified after creation
    
    status = models.CharField(
        max_length=50,
        choices=PRAYER_STATUS_CHOICES,
        default='new',
    )
    
    is_ai_generated = models.BooleanField(default=False)
    ai_generation_references = models.TextField(blank=True, null=True) # To store what info AI used

    def __str__(self):
        return f"{self.text[:50]}... ({self.status})"

    @property
    def age_in_days(self):
        return (timezone.now() - self.created_at).days

    def save(self, *args, **kwargs):
        if self.pk: # If the object is being updated
            old_prayer = Prayer.objects.get(pk=self.pk)
            if old_prayer.text != self.text:
                self.has_been_changed = True
        super().save(*args, **kwargs)
