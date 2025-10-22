from django.urls import path
from django.contrib.auth.decorators import login_required
from . import views

urlpatterns = [
    path('', login_required(views.prayer_list_view), name='prayer_list'),
    path('add/', login_required(views.add_prayer_view), name='add_prayer'),
    path('suggest/', login_required(views.suggest_ai_prayer_view), name='suggest_ai_prayer'),
    path('delete/<uuid:prayer_id>/', login_required(views.delete_prayer_view), name='delete_prayer'),
    path('mark_prayed/<uuid:prayer_id>/', login_required(views.mark_as_prayed_over_view), name='mark_as_prayed_over'),
    path('update_status/<uuid:prayer_id>/', login_required(views.update_prayer_status_view), name='update_prayer_status'),
    path('generate_from_existing/<uuid:prayer_id>/<str:length>/', login_required(views.generate_from_existing_view), name='generate_from_existing'),
    path('topic_prayer/<str:topic>/', login_required(views.topic_prayer_view), name='topic_prayer'),
    path('topic_preview/<str:topic>/', login_required(views.topic_prayer_preview), name='topic_prayer_preview'),
    path('random_topic_preview/', login_required(views.topic_prayer_preview), {'topic': 'random'}, name='random_topic_preview'),
    path('topics/', login_required(views.prayer_topics_view), name='prayer_topics'),
    path('save_generated_prayer/', login_required(views.save_generated_prayer), name='save_generated_prayer'),
]