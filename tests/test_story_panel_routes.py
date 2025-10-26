"""Tests for story and panel management endpoints."""
from __future__ import annotations

import json

from mangasuperb.extensions import db
from mangasuperb.services import jobs
from models import (
    Comic,
    ComicOutlineSection,
    ComicPage,
    ComicPageLayout,
    ComicPagePanel,
    ComicPanelShot,
    ComicWorkflowStage,
    Script,
    User,
)


def _build_script_payload(panel_count: int = 2) -> dict[str, object]:
    panels: list[dict[str, str]] = []
    for idx in range(1, panel_count + 1):
        panels.append(
            {
                "panel_number": idx,
                "scene": f"Scene {idx}",
                "dialogue": f"Line {idx}",
                "visual_notes": f"Visual {idx}",
            }
        )
    return {
        "title": "Story Hook",
        "story": "An unlikely team forms.",
        "style_notes": "Bold inks",
        "panels": panels,
    }


def _create_comic(app, user: User, panel_count: int = 2) -> int:
    payload = _build_script_payload(panel_count)
    with app.app_context():
        script = Script(
            user_id=user.id,
            title=payload["title"],
            content=json.dumps(payload),
        )
        comic = Comic(
            user_id=user.id,
            script=script,
            title=payload["title"],
            style_description=payload["style_notes"],
            aspect_ratio="16:9",
        )
        db.session.add_all([script, comic])
        db.session.commit()
        jobs.bootstrap_comic_workflow(comic)
        db.session.commit()
        return comic.id


def test_upsert_story_outline_resets_workflow(app, auth_client, user: User):
    comic_id = _create_comic(app, user)

    with app.app_context():
        section = ComicOutlineSection(
            comic_id=comic_id,
            order_index=1,
            title="Old",
            summary="Original summary",
        )
        db.session.add(section)
        db.session.flush()
        panel = ComicPanelShot(
            comic_id=comic_id,
            outline_section_id=section.id,
            sequence_index=1,
            description="Old panel",
        )
        layout = ComicPageLayout(comic_id=comic_id, page_number=1, layout_key="auto-grid")
        db.session.add_all([panel, layout])
        db.session.commit()

    response = auth_client.post(
        f"/api/stories/{comic_id}",
        json={
            "sections": [
                {"title": "Act 1", "summary": "Setup"},
                {"title": "Act 2", "summary": "Complication"},
            ]
        },
    )
    assert response.status_code == 200

    with app.app_context():
        sections = (
            ComicOutlineSection.query.filter_by(comic_id=comic_id)
            .order_by(ComicOutlineSection.order_index)
            .all()
        )
        assert [section.summary for section in sections] == ["Setup", "Complication"]
        assert ComicPanelShot.query.filter_by(comic_id=comic_id).count() == 0
        assert ComicPageLayout.query.filter_by(comic_id=comic_id).count() == 0

        comic = db.session.get(Comic, comic_id)
        assert comic.workflow_stage == "shots"
        assert comic.workflow_status == "pending"
        assert comic.status == "pending"

        stages = {
            stage.stage: stage
            for stage in ComicWorkflowStage.query.filter_by(comic_id=comic_id).all()
        }
        assert stages["outline"].status == "completed"
        assert stages["shots"].status == "pending"
        assert stages["render"].status == "pending"


def test_optimize_story_enqueues_jobs(app, auth_client, user: User, dummy_queue, monkeypatch):
    comic_id = _create_comic(app, user)
    called = {}

    from mangasuperb.routes import stories

    def fake_enqueue(queue, comic):
        called["queue"] = queue
        called["comic_id"] = comic.id
        return {"outline_job_id": "job-a", "shot_job_id": "job-b"}

    monkeypatch.setattr(stories, "enqueue_story_optimization", fake_enqueue)

    response = auth_client.post(f"/api/stories/{comic_id}/optimize")
    assert response.status_code == 202
    payload = response.get_json()
    assert payload["stage_jobs"] == {"outline_job_id": "job-a", "shot_job_id": "job-b"}
    assert payload["comic"]["id"] == comic_id

    assert called["queue"] is dummy_queue
    assert called["comic_id"] == comic_id


def test_update_panel_assigns_layout(app, auth_client, user: User):
    comic_id = _create_comic(app, user)

    with app.app_context():
        section = ComicOutlineSection(
            comic_id=comic_id,
            order_index=1,
            title="Act",
            summary="Opening",
        )
        db.session.add(section)
        db.session.flush()
        panel = ComicPanelShot(
            comic_id=comic_id,
            outline_section_id=section.id,
            sequence_index=1,
            description="Draft panel",
        )
        layout = ComicPageLayout(
            comic_id=comic_id,
            page_number=1,
            layout_key="auto-grid",
            status="suggested",
        )
        db.session.add_all([panel, layout])
        db.session.commit()
        panel_id = panel.id
        layout_id = layout.id

    response = auth_client.patch(
        f"/api/panels/{panel_id}",
        json={
            "description": "Refined panel",
            "page_number": 1,
            "panel_number": 2,
            "dialogue": "Updated",
        },
    )
    assert response.status_code == 200

    with app.app_context():
        panel = db.session.get(ComicPanelShot, panel_id)
        assert panel.description == "Refined panel"
        assert panel.page_number == 1
        assert panel.panel_number == 2

        layout = db.session.get(ComicPageLayout, layout_id)
        assignments = ComicPagePanel.query.filter_by(page_layout_id=layout.id).all()
        assert len(assignments) == 1
        assert assignments[0].position == 2
        assert assignments[0].panel_shot_id == panel.id

        comic = db.session.get(Comic, comic_id)
        assert comic.workflow_stage == "render"
        assert comic.workflow_status == "pending"
        assert comic.status == "pending"

        stage = (
            ComicWorkflowStage.query.filter_by(comic_id=comic_id, stage="render").first()
        )
        assert stage.status == "pending"


def test_update_layout_reorders_panels(app, auth_client, user: User):
    comic_id = _create_comic(app, user)

    with app.app_context():
        section = ComicOutlineSection(
            comic_id=comic_id,
            order_index=1,
            title="Act",
            summary="Opening",
        )
        db.session.add(section)
        db.session.flush()
        panel_one = ComicPanelShot(
            comic_id=comic_id,
            outline_section_id=section.id,
            sequence_index=1,
            description="First",
        )
        panel_two = ComicPanelShot(
            comic_id=comic_id,
            outline_section_id=section.id,
            sequence_index=2,
            description="Second",
        )
        db.session.add_all([panel_one, panel_two])
        db.session.commit()
        panel_ids = [panel_one.id, panel_two.id]

    response = auth_client.post(
        f"/api/panels/{comic_id}/layouts",
        json={
            "page_number": 1,
            "layout_key": "grid-2x2",
            "notes": "Balance action",
            "panel_order": panel_ids[::-1],
        },
    )
    assert response.status_code == 200

    with app.app_context():
        layout = ComicPageLayout.query.filter_by(comic_id=comic_id, page_number=1).first()
        assert layout.layout_key == "grid-2x2"
        assert layout.notes == "Balance action"
        assert layout.status == "selected"
        assert layout.selected_at is not None

        assignments = (
            ComicPagePanel.query.filter_by(page_layout_id=layout.id)
            .order_by(ComicPagePanel.position)
            .all()
        )
        assert [assignment.panel_shot_id for assignment in assignments] == panel_ids[::-1]

        panels = (
            ComicPanelShot.query.filter_by(comic_id=comic_id)
            .order_by(ComicPanelShot.panel_number)
            .all()
        )
        assert [panel.panel_number for panel in panels] == [1, 2]

        comic = db.session.get(Comic, comic_id)
        assert comic.workflow_stage == "render"
        assert comic.workflow_status == "pending"
        assert comic.status == "pending"


def test_render_page_endpoint_enqueues_job(app, auth_client, user: User, dummy_queue):
    comic_id = _create_comic(app, user)

    response = auth_client.post(
        f"/api/panels/{comic_id}/pages/1/render",
        json={},
    )
    assert response.status_code == 202
    payload = response.get_json()
    assert payload["comic"]["workflow_stage"] == "render"
    assert payload["comic"]["workflow_status"] == "in_progress"
    assert payload["job_id"] == dummy_queue.jobs[-1].id

    with app.app_context():
        comic = db.session.get(Comic, comic_id)
        assert comic.workflow_stage == "render"
        assert comic.workflow_status == "in_progress"
        assert comic.status == "processing"


def test_get_comic_images_returns_urls(app, auth_client, user: User):
    comic_id = _create_comic(app, user)

    cover_url = "https://cdn.example.com/cover.png"
    page_url = "https://cdn.example.com/page-1.png"

    with app.app_context():
        comic = db.session.get(Comic, comic_id)
        assert comic is not None
        comic.cover_image_url = cover_url
        page = ComicPage(
            comic_id=comic_id,
            script_id=comic.script_id,
            page_number=1,
            image_url=page_url,
            panel_text='{"panels": []}',
        )
        db.session.add(page)
        db.session.commit()
        page_id = page.id

    response = auth_client.get(f"/api/comics/{comic_id}/images")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["comic_id"] == comic_id
    assert payload["cover_image_url"] == cover_url
    assert payload["page_count"] == 1
    assert payload["pages"] == [
        {"page_id": page_id, "page_number": 1, "image_url": page_url},
    ]


def test_get_comic_images_rejects_other_user(app, auth_client, user: User):
    with app.app_context():
        other = User(
            username="other-user",
            email="other@example.com",
            password_hash="hashed",
        )
        db.session.add(other)
        db.session.flush()
        script = Script(user_id=other.id, title="Other", content='{"panels": []}')
        comic = Comic(
            user_id=other.id,
            script=script,
            title="Other comic",
            style_description="Noir",
            aspect_ratio="16:9",
        )
        db.session.add_all([script, comic])
        db.session.commit()
        other_comic_id = comic.id

    response = auth_client.get(f"/api/comics/{other_comic_id}/images")
    assert response.status_code == 404
