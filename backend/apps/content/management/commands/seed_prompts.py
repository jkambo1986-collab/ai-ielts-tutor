"""
Seed the default IELTS prompt library for every institute that doesn't
yet have any prompts. Idempotent — safe to run multiple times.

These mirror the previous client-side constants.ts so existing UI looks
identical when the FE switches to fetching from the API.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.content.models import Prompt
from apps.tenants.models import Institute


WRITING_PROMPTS = [
    "Some people believe that unpaid community service should be a compulsory part of high school programmes. To what extent do you agree or disagree?",
    "In some countries, young people are encouraged to work or travel for a year between finishing high school and starting university studies. Discuss the advantages and disadvantages.",
    "Some people think that governments should ban dangerous sports, while others think people should be free to choose any sports or activities. Discuss both views and give your own opinion.",
    "The internet has transformed the way information is shared and consumed, but it has also created problems. What are the most serious problems associated with the internet and what solutions can be suggested?",
    "Many people believe that the main aim of university education is to help graduates find better jobs, while others believe it has wider benefits. Discuss both views and give your opinion.",
    "The increasing use of technology in education has a significant impact. Discuss the advantages and disadvantages of this trend.",
    "Some people argue that the most effective way to solve global environmental problems is to increase the cost of fuel for cars and planes. To what extent do you agree or disagree?",
    "As cities expand, more people are living in high-rise apartment buildings. Do the advantages of this trend outweigh the disadvantages?",
    "Many people today are choosing to follow vegetarian or vegan diets. What are the reasons for this, and do you consider it a positive or negative development?",
    "With the rise of remote work, the line between professional and private life is becoming increasingly blurred. What problems does this cause, and what are the solutions?",
]

SPEAKING_PROMPTS: dict[str, list[str]] = {
    Prompt.PART_1: [
        "Let's talk about your hometown. Where is your hometown?",
        "What do you like most about your hometown?",
        "Has your hometown changed much since you were a child?",
        "Let's talk about food. What's your favorite food?",
        "Do you enjoy cooking? Why or why not?",
        "What is a traditional dish from your country?",
        "Let's discuss hobbies. Do you have any hobbies?",
        "How did you get started with your hobby?",
        "Do you think it's important for people to have hobbies?",
        "Let's talk about travel. Do you enjoy traveling?",
        "What's the most beautiful place you've ever visited?",
        "Do you prefer traveling alone or with others?",
    ],
    Prompt.PART_2: [
        "Describe a website you visit often. You should say: what the website is, how you found it, what you use it for, and explain why you visit it often.",
        "Describe a person who you admire. You should say: who this person is, how you know them, what qualities they have, and explain why you admire them.",
        "Describe a memorable holiday you've had. You should say: where you went, who you were with, what you did, and explain why it was so memorable.",
        "Describe a skill you would like to learn. You should say: what the skill is, why you want to learn it, how you would learn it, and explain how it would help you in the future.",
        "Describe a book you have recently read. You should say: what the book was about, why you decided to read it, what you learned from it, and explain whether you would recommend it.",
        "Describe an interesting conversation you had with someone. You should say: who you spoke with, where you were, what you talked about, and explain why the conversation was interesting.",
    ],
    Prompt.PART_3: [
        "How has the internet changed the way people access information?",
        "What are the pros and cons of social media?",
        "In what ways can technology help people to learn new skills?",
        "What qualities do you think a good leader should have?",
        "Do you think role models are important for young people?",
        "How does a person's culture influence their personality?",
        "What are the benefits of international travel?",
        "How can tourism negatively affect a local community?",
        "Do you think it's better to travel to popular tourist destinations or off-the-beaten-path locations?",
        "What is the importance of reading in a person's life?",
        "Do you think e-books will eventually replace physical books completely?",
        "How can parents encourage their children to read more?",
    ],
}


class Command(BaseCommand):
    help = "Seed default writing + speaking prompts for institutes that have none."

    def add_arguments(self, parser):
        parser.add_argument("--slug", help="Seed a specific institute slug only.")
        parser.add_argument(
            "--force", action="store_true",
            help="Add prompts even if the institute already has some.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        institutes = Institute.objects.all()
        if options.get("slug"):
            institutes = institutes.filter(slug=options["slug"])

        for inst in institutes:
            existing = Prompt.objects.filter(institute=inst).exists()
            if existing and not options.get("force"):
                self.stdout.write(f"- {inst.slug}: already has prompts; skipping (use --force to add anyway)")
                continue

            count = 0
            for text in WRITING_PROMPTS:
                Prompt.objects.create(institute=inst, skill=Prompt.SKILL_WRITING, text=text)
                count += 1
            for part, prompts in SPEAKING_PROMPTS.items():
                for text in prompts:
                    Prompt.objects.create(
                        institute=inst, skill=Prompt.SKILL_SPEAKING, part=part, text=text,
                    )
                    count += 1
            self.stdout.write(self.style.SUCCESS(f"+ {inst.slug}: seeded {count} prompts"))
