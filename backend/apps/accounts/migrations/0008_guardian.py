import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_user_target_subscores'),
    ]

    operations = [
        migrations.CreateModel(
            name='Guardian',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('email', models.EmailField(max_length=254)),
                ('relationship', models.CharField(blank=True, default='', help_text='Free-form: parent, sponsor, employer, etc.', max_length=40)),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('last_viewed_at', models.DateTimeField(blank=True, null=True)),
                ('view_count', models.PositiveIntegerField(default=0)),
                ('student', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='guardians', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'accounts_guardian',
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['student', 'revoked_at'], name='accounts_gu_student_a8f7f5_idx')],
            },
        ),
    ]
