from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from unittest.mock import patch
from django.utils import timezone
from .models import DailyGenerationQuota


class PageAccessTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = get_user_model().objects.create_user(username='u', email='u@example.com', password='p')

    def test_home_access_anonymous(self):
        resp = self.client.get('/')
        self.assertEqual(resp.status_code, 200)

    def test_prayers_redirect_when_anonymous(self):
        resp = self.client.get(reverse('prayer_list'))
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/accounts/login/', resp['Location'])

    def test_profile_requires_login(self):
        resp = self.client.get('/profile/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/accounts/login/', resp['Location'])

    def test_profile_when_logged_in(self):
        self.client.login(username='u', password='p')
        resp = self.client.get('/profile/')
        self.assertEqual(resp.status_code, 200)


class GenerationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = get_user_model().objects.create_user(username='u', email='u@example.com', password='p')
        self.client.login(username='u', password='p')

    @patch('prayers.apologist_client.get_ai_prayer_suggestion')
    def test_suggest_ai_happy_path(self, mock_gen):
        mock_gen.return_value = ("sample prayer", "ref")
        resp = self.client.post(reverse('suggest_ai_prayer'), {'prompt': 'x', 'word_count': 'short'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('success', resp.json())
        self.assertTrue(resp.json()['success'])

    @patch('prayers.apologist_client.get_ai_prayer_suggestion')
    def test_suggest_ai_dep_error(self, mock_gen):
        mock_gen.return_value = (None, 'Error during AI generation: boom')
        resp = self.client.post(reverse('suggest_ai_prayer'), {'prompt': 'x', 'word_count': 'short'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['success'])

    def test_suggest_ai_bad_input(self):
        resp = self.client.post(reverse('suggest_ai_prayer'), {'word_count': 'short'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        # form invalid -> success False
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['success'])

    @patch('prayers.apologist_client.get_ai_prayer_suggestion')
    def test_quota_limit(self, mock_gen):
        # seed quota to 10
        today = timezone.now().date()
        DailyGenerationQuota.objects.create(user=self.user, date=today, count=10)
        mock_gen.return_value = ("sample prayer", "ref")
        resp = self.client.post(reverse('suggest_ai_prayer'), {'prompt': 'x'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(resp.status_code, 429)


class LoginRequiredTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_generate_from_existing_requires_login(self):
        # hitting any secured endpoint should redirect
        resp = self.client.post(reverse('generate_from_existing', args=[1, 'short']))
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/accounts/login/', resp['Location'])
