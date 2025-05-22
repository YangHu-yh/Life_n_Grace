from django import template

register = template.Library()

@register.filter(name='filter_by_status')
def filter_by_status(prayers, status):
    """
    Filter prayers by status.
    Usage: {% if prayers|filter_by_status:status_val %}
    """
    return [prayer for prayer in prayers if prayer.status == status]

@register.filter(name='add_class')
def add_class(field, css_class):
    """
    Add a CSS class to a form field.
    Usage: {{ form.field|add_class:"form-control" }}
    """
    return field.as_widget(attrs={"class": css_class}) 