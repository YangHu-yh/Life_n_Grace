import os
import random
import logging
from typing import Optional, Tuple
import requests
import re
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

# Apologist Fusion configuration from environment
def _read_env():
    return {
        'API_KEY': os.getenv("APOLOGIST_API_KEY"),
        'API_URL': os.getenv("APOLOGIST_API_URL", "https://life-n-grace-dev.apologetics.bot/api/v1"),
        'MODEL_ID': os.getenv("APOLOGIST_MODEL_ID", ""),
        'TRANSLATION': os.getenv("APOLOGIST_TRANSLATION", "esv"),
        'CHAT_COMPLETIONS_URL': os.getenv("APOLOGIST_CHAT_COMPLETIONS_URL"),
        'DEBUG': os.getenv("APOLOGIST_DEBUG", "false").lower() == "true",
        'TIMEOUT': float(os.getenv("APOLOGIST_TIMEOUT", "30")),
        'STRICT_OPENAI': os.getenv("APOLOGIST_STRICT_OPENAI", "false").lower() == "true",
    }


class _ApologistResponsePart:
    def __init__(self, text: str):
        self.text = text


class _ApologistResponse:
    def __init__(self, text: str):
        self.text = text
        self.parts = [__class__.Part(text)] if text else []

    class Part:
        def __init__(self, text: str):
            self.text = text


class ApologistModel:
    def __init__(self, base_url: str, api_key: str, model_id: str, timeout_sec: float = 30.0, debug: bool = False, strict_openai: bool = False, chat_completions_url: Optional[str] = None):
        # Normalize base URL: add https:// if missing, strip trailing slash
        normalized = (base_url or "").strip()
        if normalized and not normalized.lower().startswith(("http://", "https://")):
            normalized = "https://" + normalized
        # If base_url looks like a site path (e.g., /en) or an already-formed
        # language-prefixed endpoint (e.g., /en/chat/completions), rewrite
        # to the API path under /api/v1
        try:
            parsed = urlparse(normalized)
            path = parsed.path or ""
            # Case 1: exactly "/xx" or "/xx/"
            if re.fullmatch(r"/[a-z]{2}(/)?", path):
                parsed = parsed._replace(path="/api/v1")
                normalized = urlunparse(parsed)
            else:
                # Case 2: starts with "/xx/" and ends with "/chat/completions"
                if re.match(r"^/[a-z]{2}/", path) and path.endswith("/chat/completions"):
                    parsed = parsed._replace(path="/api/v1/chat/completions")
                    normalized = urlunparse(parsed)
        except Exception:
            pass
        self.base_url = normalized.rstrip("/")
        self.api_key = api_key
        self.model_id = model_id
        self.timeout_sec = timeout_sec
        self.debug = debug
        self.strict_openai = strict_openai
        # Allow explicit endpoint override; otherwise, append path if needed
        if chat_completions_url:
            endpoint = chat_completions_url.strip()
            if endpoint and not endpoint.lower().startswith(("http://", "https://")):
                endpoint = "https://" + endpoint
            # Correct language-prefixed paths like /en/chat/completions to /api/v1/chat/completions
            try:
                e_parsed = urlparse(endpoint)
                e_path = e_parsed.path or ""
                if e_path.startswith("/en/") and e_path.endswith("/chat/completions"):
                    e_parsed = e_parsed._replace(path="/api/v1/chat/completions")
                    endpoint = urlunparse(e_parsed)
            except Exception:
                pass
            self.endpoint = endpoint
        else:
            # If base already includes language prefix to /chat/completions, correct it
            try:
                b_parsed = urlparse(self.base_url)
                b_path = b_parsed.path or ""
                if re.match(r"^/[a-z]{2}/", b_path) and b_path.endswith("/chat/completions"):
                    b_parsed = b_parsed._replace(path="/api/v1/chat/completions")
                    self.base_url = urlunparse(b_parsed).rstrip("/")
            except Exception:
                pass

            if self.base_url.endswith("/chat/completions"):
                self.endpoint = self.base_url
            else:
                self.endpoint = f"{self.base_url}/chat/completions"

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    def _extract_text(self, data) -> str:
        # Prefer OpenAI-compatible shape
        try:
            choices = data.get("choices")
            if choices and len(choices) > 0:
                message = choices[0].get("message") or {}
                content = message.get("content")
                if isinstance(content, str):
                    return content
        except Exception:
            pass
        # Apologist "json" format may include a top-level completion/text
        for key in ("completion", "text", "output", "content"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val
        # Fallback empty string
        return ""

    def generate_content(self, prompt_text: str) -> _ApologistResponse:
        # Build OpenAI-style payload
        base_payload = {
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": False,
        }
        if not self.strict_openai:
            # Include optional fields when not in strict mode
            base_payload["response_format"] = {"type": "json"}
            base_payload["metadata"] = {"anonymous": True}
        if self.model_id:
            base_payload["model"] = self.model_id

        # Try request, with a fallback if the server rejects optional fields
        attempts = [base_payload]
        if not self.strict_openai:
            fallback = {k: v for k, v in base_payload.items() if k not in ("response_format", "metadata")}
            attempts.append(fallback)

        last_error = None
        for idx, payload in enumerate(attempts, start=1):
            try:
                if self.debug:
                    logger.info("Apologist request attempt=%d endpoint=%s has_model=%s payload_keys=%s", idx, self.endpoint, bool(self.model_id), list(payload.keys()))
                resp = self.session.post(self.endpoint, json=payload, timeout=self.timeout_sec)
                if self.debug:
                    logger.info("Apologist response attempt=%d status=%s", idx, resp.status_code)
                resp.raise_for_status()
                text_out = ""
                try:
                    data = resp.json()
                    if self.debug:
                        logger.debug("Apologist JSON keys: %s", list(data.keys()))
                    text_out = self._extract_text(data)
                except ValueError:
                    text_out = resp.text or ""
                if not text_out and self.debug:
                    logger.warning("Apologist empty text response; returning raw text length=%d", len(resp.text or ""))
                return _ApologistResponse(text_out)
            except Exception as e:
                last_error = e
                try:
                    if self.debug and 'resp' in locals() and resp is not None:
                        logger.warning("Apologist error status=%s body=%s", getattr(resp, 'status_code', None), resp.text[:500] if resp.text else "")
                    if 'resp' in locals() and resp is not None and resp.status_code in (401, 403):
                        logger.error("Apologist auth/model error (401/403). Check API key domain permissions and model access.")
                except Exception:
                    logger.exception("Error while logging Apologist failure context")
                # Retry next attempt if available
                continue
        logger.exception("Apologist request failed after %d attempts", len(attempts))
        return _ApologistResponse("")


_MODEL_CACHE = {
    'model': None,
    'env': None,
}

def get_model() -> Optional[ApologistModel]:
    env = _read_env()
    cached_env = _MODEL_CACHE['env']
    if _MODEL_CACHE['model'] is not None and cached_env == env:
        return _MODEL_CACHE['model']
    api_key = env['API_KEY']
    api_url = env['API_URL']
    if not api_key or not api_url:
        _MODEL_CACHE['model'] = None
        _MODEL_CACHE['env'] = env
        return None
    model = ApologistModel(
        base_url=api_url,
        api_key=api_key,
        model_id=env['MODEL_ID'],
        timeout_sec=env['TIMEOUT'],
        debug=env['DEBUG'],
        strict_openai=env['STRICT_OPENAI'],
        chat_completions_url=env['CHAT_COMPLETIONS_URL'],
    )
    _MODEL_CACHE['model'] = model
    _MODEL_CACHE['env'] = env
    return model


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


def get_ai_prayer_suggestion(prompt_text: str, word_count: str = "medium") -> Tuple[Optional[str], Optional[str]]:
    """
    Generates a prayer suggestion based on the prompt_text using the Apologist API.

    Args:
        prompt_text: The input text to base the prayer suggestion on.
        word_count: "short" (0-100 words), "medium" (100-200 words), or "long" (200-500 words)

    Returns:
        A tuple containing the suggested prayer (str) and references (str).
        Returns (None, "API Key not configured or model not initialized.") if the API is not available.
        Returns (None, "Error message") if generation fails.
    """
    model = get_model()
    if not model:
        logger.warning("Apologist model not initialized (missing API URL or key)")
        return None, "AI API key not configured or model not initialized."

    try:
        count_ranges = {
            "short": "0-100 words",
            "medium": "100-200 words",
            "long": "200-500 words"
        }
        word_range = count_ranges.get(word_count, count_ranges["medium"])
        full_prompt = f"""Generate a prayer suggestion based on the following topic or need: "{prompt_text}". 
The prayer should be comforting, inspirational, and approximately {word_range} in length.
Include appropriate references to Scripture where relevant."""
        response = model.generate_content(full_prompt)
        suggested_prayer = response.text if hasattr(response, 'text') else ""
        if not suggested_prayer and hasattr(response, 'parts'):
            suggested_prayer = ''.join(part.text for part in getattr(response, 'parts') if hasattr(part, 'text'))
        if not suggested_prayer:
            suggested_prayer = "Could not parse the prayer suggestion from the AI response."
        references = f"AI-generated based on the prompt: \"{prompt_text[:150]}{'...' if len(prompt_text) > 150 else ''}\" ({word_range})."
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating prayer suggestion via Apologist: {e}")
        return None, f"Error during AI generation: {str(e)}"


def generate_prayer_from_existing(prayer_text: str, word_count: str = "medium") -> Tuple[Optional[str], Optional[str]]:
    """
    Generates a new prayer based on an existing prayer, with optional length specification.
    """
    model = get_model()
    if not model:
        logger.warning("Apologist model not initialized (missing API URL or key)")
        return None, "AI API key not configured or model not initialized."
    try:
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
        suggested_prayer = response.text if hasattr(response, 'text') else ""
        if not suggested_prayer and hasattr(response, 'parts'):
            suggested_prayer = ''.join(part.text for part in getattr(response, 'parts') if hasattr(part, 'text'))
        if not suggested_prayer:
            suggested_prayer = "Could not parse the prayer suggestion from the AI response."
        references = f"AI-generated based on an existing prayer ({word_range})."
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating prayer from existing via Apologist: {e}")
        return None, f"Error during AI generation: {str(e)}"


def get_short_prayer_for_topic(topic: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Generates a short prayer suggestion for a given topic.
    """
    model = get_model()
    if not model or topic not in PRAYER_TOPICS:
        return None, "Topic not recognized or API not available."
    try:
        verses = PRAYER_TOPICS[topic]
        selected_verse = random.choice(verses)
        full_prompt = f"""Create a short prayer (50-70 words) for the topic "{topic}" 
that incorporates the essence of this Bible verse: {selected_verse}."""
        response = model.generate_content(full_prompt)
        suggested_prayer = response.text if hasattr(response, 'text') else ""
        if not suggested_prayer and hasattr(response, 'parts'):
            suggested_prayer = ''.join(part.text for part in getattr(response, 'parts') if hasattr(part, 'text'))
        if not suggested_prayer:
            suggested_prayer = "Could not parse the prayer suggestion."
        references = f"AI-generated short prayer for '{topic}' based on {selected_verse.split(' - ')[0]}"
        return suggested_prayer, references
    except Exception as e:
        print(f"Error generating short prayer for topic: {e}")
        return None, f"Error during AI generation: {str(e)}"


