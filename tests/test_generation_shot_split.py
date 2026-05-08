from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext, PanelContext
from mangasuperb.services.generation_skills.shot_split import resolve_shot_drafts


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="shot_split",
        comic_id=7,
        comic_title="Test Comic",
        page_number=None,
        story="秦飞扬滚落台阶。“姓马的，我诅咒你不得好死！”他怒吼。",
        style_notes="Expressive ink",
        script_data={
            "panels": [
                {
                    "scene": "Original generated scene",
                    "dialogue": "Original generated line",
                    "camera": "low angle",
                    "visual_notes": "speed lines",
                }
            ]
        },
        panels=(
            PanelContext(
                panel_number=None,
                sequence_index=1,
                description="秦飞扬滚落台阶。“姓马的，我诅咒你不得好死！”他怒吼。",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
                source_title="Confrontation",
            ),
        ),
        layout=None,
        characters=(),
        visual_preferences={},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def test_shot_split_preserves_order_and_extracts_dialogue() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert len(drafts) == 1
    assert drafts[0].sequence_index == 1
    assert drafts[0].page_number == 1
    assert drafts[0].panel_number == 1
    assert drafts[0].title == "Confrontation"
    assert drafts[0].dialogue == "姓马的，我诅咒你不得好死！"
    assert drafts[0].description.startswith("秦飞扬滚落台阶")
    assert metadata["applied_skills"] == [
        "shot_boundary",
        "dialogue_extraction",
        "camera_style_enrichment",
        "panel_assignment",
    ]


def test_shot_split_preserves_explicit_camera_and_style_fields() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert drafts[0].camera_notes == "low angle"
    assert drafts[0].style_notes == "speed lines"
    assert metadata["panel_count"] == 1


def test_shot_split_does_not_invent_extra_drafts() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert [draft.sequence_index for draft in drafts] == [1]
    assert metadata["skipped_skills"] == []
