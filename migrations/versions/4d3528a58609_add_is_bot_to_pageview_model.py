"""Add is_bot to Pageview model

Revision ID: 4d3528a58609
Revises: c720765f1194
Create Date: 2025-11-16 22:14:01.060433

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d3528a58609'
down_revision: Union[str, Sequence[str], None] = 'c720765f1194'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('pageviews', sa.Column('is_bot', sa.Boolean(), nullable=False, server_default='false'))
    with op.batch_alter_table('pageviews') as batch_op:
        batch_op.alter_column('is_bot', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('pageviews', 'is_bot')
