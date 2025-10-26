"""RQ worker bootstrap for processing background jobs."""
from __future__ import annotations

import logging
import os

from redis import Redis
from rq import Connection, Queue, Worker

from mangasuperb import create_app

logger = logging.getLogger(__name__)


def run_worker() -> None:
    """Run the RQ worker with an application context."""
    app = create_app()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    with app.app_context():
        redis_url = app.config["REDIS_URL"]
        logger.info("Connecting to Redis: %s", redis_url)

        with Connection(Redis.from_url(redis_url)):
            queue = Queue(app.config["RQ_QUEUE_NAME"])
            worker = Worker([queue], name=f"manga-worker-{os.getpid()}")

            logger.info("=" * 60)
            logger.info("MangaSuperb RQ Worker Started")
            logger.info("=" * 60)
            logger.info("Worker: %s", worker.name)
            logger.info("Queue: %s", queue.name)
            logger.info("Job timeout: %ss", app.config["RQ_JOB_TIMEOUT"])
            logger.info("=" * 60)

            worker.work(with_scheduler=True)


if __name__ == "__main__":
    run_worker()
