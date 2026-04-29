"""
Lightweight vocabulary analyzer for #19 (vocab range tracker).

Strategy: lemmatise (poor-man — strip common suffixes), drop stopwords, look
each lemma up against a small bundled CEFR/AWL lexicon. Anything not in the
lexicon still counts as a unique word but won't contribute to "B2+ unique"
or "AWL" counts.

The lexicon here is intentionally small — only the discriminative high-band
words. We can replace with a richer external dataset later without changing
the call sites; the function signature is what matters.
"""

from __future__ import annotations

import re
from typing import Iterable

# Basic stopwords. Keeping it short — anything in here is too common to count.
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "in", "on", "at", "to",
    "from", "by", "for", "with", "about", "as", "is", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "i",
    "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "this", "that", "these",
    "those", "there", "here", "what", "which", "who", "whom", "whose",
    "when", "where", "why", "how", "not", "no", "yes", "so", "than", "then",
    "very", "really", "just", "also", "more", "less", "much", "many", "few",
    "some", "any", "all", "each", "every", "such", "only", "own", "same",
    "too", "now", "still", "even", "well", "ok", "okay",
}

# Tiny seed lexicon: lemma → (CEFR, is_awl).
# Real production lookup would be a CSV/JSON loaded at startup. This list is
# enough to produce useful counts while we bootstrap.
LEXICON: dict[str, tuple[str, bool]] = {
    # B2 / academic
    "analyze": ("B2", True), "analysis": ("B2", True), "analytical": ("B2", True),
    "approach": ("B2", True), "assess": ("B2", True), "assessment": ("B2", True),
    "benefit": ("B2", False), "challenge": ("B2", False), "concept": ("B2", True),
    "conclude": ("B2", True), "conclusion": ("B2", True), "consequence": ("B2", True),
    "consider": ("B2", False), "considerable": ("B2", True), "constitute": ("B2", True),
    "contribute": ("B2", True), "contribution": ("B2", True), "demonstrate": ("B2", True),
    "develop": ("B2", False), "distinguish": ("B2", True), "diverse": ("B2", True),
    "establish": ("B2", True), "evident": ("B2", True), "examine": ("B2", True),
    "factor": ("B2", True), "fundamental": ("B2", True), "implement": ("B2", True),
    "imply": ("B2", True), "indicate": ("B2", True), "individual": ("B2", True),
    "interpret": ("B2", True), "involve": ("B2", True), "issue": ("B2", True),
    "method": ("B2", True), "perceive": ("B2", True), "phenomenon": ("B2", True),
    "potential": ("B2", True), "primary": ("B2", True), "principle": ("B2", True),
    "promote": ("B2", True), "regard": ("B2", False), "relevant": ("B2", True),
    "require": ("B2", False), "research": ("B2", True), "respond": ("B2", True),
    "reveal": ("B2", True), "significant": ("B2", True), "specific": ("B2", True),
    "strategy": ("B2", True), "structure": ("B2", True), "substantial": ("B2", True),
    "sufficient": ("B2", True), "tend": ("B2", False), "transform": ("B2", True),

    # C1 / advanced academic
    "advocate": ("C1", True), "albeit": ("C1", True), "ambiguous": ("C1", True),
    "comprehensive": ("C1", True), "conceive": ("C1", True), "controversy": ("C1", True),
    "deduce": ("C1", True), "delineate": ("C1", True), "discrepancy": ("C1", True),
    "elaborate": ("C1", True), "encompass": ("C1", True), "exacerbate": ("C1", True),
    "facilitate": ("C1", True), "imminent": ("C1", False), "inevitable": ("C1", False),
    "inherent": ("C1", True), "intrinsic": ("C1", False), "juxtapose": ("C1", True),
    "mitigate": ("C1", True), "nuance": ("C1", False), "paradigm": ("C1", True),
    "pertinent": ("C1", False), "ramification": ("C1", False), "scrutinize": ("C1", False),
    "stipulate": ("C1", True), "tangible": ("C1", False), "underpin": ("C1", True),

    # C2 / sophisticated
    "arguably": ("C2", False), "ostensibly": ("C2", False), "ubiquitous": ("C2", False),
    "verbatim": ("C2", False), "magnanimous": ("C2", False), "obfuscate": ("C2", False),
    "quintessential": ("C2", False),
}


_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z'-]+")


def _lemmatise(word: str) -> str:
    """Strip a few common suffixes. Not real morphology, but good enough to
    fold simple inflections together without a heavy dependency."""
    w = word.lower().strip("-'")
    for suf in ("ization", "isation", "ational", "ements", "ically", "edness", "ingly"):
        if w.endswith(suf):
            return w[: -len(suf)]
    for suf in ("tion", "sion", "ness", "ment", "able", "ible", "ised", "ized",
                "ising", "izing", "ies", "ied", "ily"):
        if w.endswith(suf):
            return w[: -len(suf)]
    for suf in ("ing", "ers", "est", "ed", "es", "ly", "er", "or", "al", "ic"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)]
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return w[:-1]
    return w


def extract_lemmas(text: str) -> list[dict]:
    """Tokenise → lemmatise → drop stopwords → return [{lemma, cefr_level, is_awl}, ...]."""
    seen: dict[str, dict] = {}
    for match in _TOKEN_RE.findall(text or ""):
        lemma = _lemmatise(match)
        if lemma in STOPWORDS or len(lemma) < 3:
            continue
        if lemma in seen:
            continue
        cefr, awl = LEXICON.get(lemma, ("", False))
        seen[lemma] = {"lemma": lemma, "cefr_level": cefr, "is_awl": awl}
    return list(seen.values())


def transcript_text(transcript: list[dict]) -> str:
    """Pull the user-side text out of a Speaking session transcript JSON."""
    parts = []
    for turn in transcript or []:
        if turn.get("speaker") == "user":
            parts.append(turn.get("text", ""))
    return " ".join(parts)
