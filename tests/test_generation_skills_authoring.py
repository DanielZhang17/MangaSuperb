from __future__ import annotations

from pathlib import Path


def test_generation_skill_authoring_guide_captures_operational_rules() -> None:
    guide = Path("docs/generation-skills-authoring.md").read_text(encoding="utf-8")

    required_phrases = [
        "Runtime Generation Skill",
        "provider-agnostic",
        "required skills fail the job",
        "non-required skills log and skip",
        "reference images outrank text descriptions",
        "dialogue text uses a controlled policy",
        "official provider guidance",
    ]

    for phrase in required_phrases:
        assert phrase in guide
