# Hikaru Analytics

Hikaru Analytics is a lightweight, privacy-focused analytics tool built with FastAPI and SQLAlchemy . It follows a "less is more" philosophy, providing essential tracking (pageviews and time spent) with a weekly email digest instead of a complex real-time dashboard.

## Deploying

This code assumes you are running the service in ~/analytics.

Run this:

    sudo loginctl enable-linger $USER

Then as then run this:

    ./setup
