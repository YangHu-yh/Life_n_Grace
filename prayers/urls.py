from django.urls import path
from . import views

urlpatterns = [
    path('', views.prayer_list_view, name='prayer_list'),
    path('add/', views.add_prayer_view, name='add_prayer'),
    path('suggest/', views.suggest_ai_prayer_view, name='suggest_ai_prayer'),
    path('delete/<int:prayer_id>/', views.delete_prayer_view, name='delete_prayer'),
    path('mark_prayed/<int:prayer_id>/', views.mark_as_prayed_over_view, name='mark_as_prayed_over'),
    path('update_status/<int:prayer_id>/', views.update_prayer_status_view, name='update_prayer_status'),
    path('generate_from_existing/<int:prayer_id>/<str:length>/', views.generate_from_existing_view, name='generate_from_existing'),
    path('topic_prayer/<str:topic>/', views.topic_prayer_view, name='topic_prayer'),
    path('topic_preview/<str:topic>/', views.topic_prayer_preview, name='topic_prayer_preview'),
    path('random_topic_preview/', views.topic_prayer_preview, {'topic': 'random'}, name='random_topic_preview'),
    path('topics/', views.prayer_topics_view, name='prayer_topics'),
    path('save_generated_prayer/', views.save_generated_prayer, name='save_generated_prayer'),
    # We will add more URLs here for updating status, count, etc.
] 