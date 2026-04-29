"""Seed the global Part 2 cue card bank (B7).

Idempotent: matches by topic, updates bullets/follow-ups in-place.
Run: `python manage.py seed_cue_cards`
"""

from django.core.management.base import BaseCommand

from apps.practice.models import CueCard


CARDS: list[dict] = [
    # -- People --
    {
        "topic": "Describe a person who has had a significant influence on you",
        "category": "person", "difficulty": "medium",
        "bullets": [
            "Who this person is",
            "How you know them",
            "What you have learnt from them",
            "And explain why their influence matters to you",
        ],
        "follow_up_questions": [
            "What qualities do you think make a good role model?",
            "Are role models more important for younger or older people?",
            "How has the idea of who is admired changed in your country?",
        ],
    },
    {
        "topic": "Describe a teacher who taught you something memorable",
        "category": "person", "difficulty": "easy",
        "bullets": [
            "Who the teacher was",
            "What subject they taught",
            "What memorable thing they taught you",
            "And explain why it stayed with you",
        ],
        "follow_up_questions": [
            "What makes a teacher effective?",
            "Should teachers be strict or friendly?",
            "How will technology change teaching in the future?",
        ],
    },
    {
        "topic": "Describe an older person you admire",
        "category": "person", "difficulty": "medium",
        "bullets": [
            "Who the person is",
            "How you know them",
            "What kind of person they are",
            "And explain why you admire them",
        ],
        "follow_up_questions": [
            "What can younger people learn from older generations?",
            "Do older people get enough respect in your country?",
            "How can societies care better for the elderly?",
        ],
    },
    {
        "topic": "Describe a friend who is different from you",
        "category": "person", "difficulty": "easy",
        "bullets": [
            "Who this friend is",
            "How you met",
            "How they differ from you",
            "And explain why you are still close",
        ],
        "follow_up_questions": [
            "Is it good to have friends who are very different from you?",
            "How do friendships change as people grow older?",
            "Are online friendships as meaningful as offline ones?",
        ],
    },

    # -- Places --
    {
        "topic": "Describe a place you would like to visit one day",
        "category": "place", "difficulty": "easy",
        "bullets": [
            "Where it is",
            "How you found out about it",
            "What you would do there",
            "And explain why you want to visit it",
        ],
        "follow_up_questions": [
            "Why do people travel for tourism?",
            "How has international travel changed in the last decade?",
            "Do you think tourism harms or helps the places it reaches?",
        ],
    },
    {
        "topic": "Describe a quiet place you enjoy spending time in",
        "category": "place", "difficulty": "easy",
        "bullets": [
            "Where it is",
            "How often you go there",
            "What you do there",
            "And explain how it makes you feel",
        ],
        "follow_up_questions": [
            "Why is silence valuable in modern life?",
            "Do cities provide enough quiet spaces?",
            "How do you usually unwind after a busy day?",
        ],
    },
    {
        "topic": "Describe a city you have visited that left an impression on you",
        "category": "place", "difficulty": "medium",
        "bullets": [
            "Which city it was",
            "When you went",
            "What you did there",
            "And explain why it left an impression",
        ],
        "follow_up_questions": [
            "What makes a city worth visiting?",
            "How are large cities different from small towns?",
            "Should governments invest more in tourism infrastructure?",
        ],
    },
    {
        "topic": "Describe a building you find interesting",
        "category": "place", "difficulty": "medium",
        "bullets": [
            "Where it is",
            "What it looks like",
            "Why it was built",
            "And explain why you find it interesting",
        ],
        "follow_up_questions": [
            "Should old buildings be preserved?",
            "How does architecture reflect a culture?",
            "What makes modern architecture different from traditional?",
        ],
    },

    # -- Personal experience --
    {
        "topic": "Describe a time when you helped someone",
        "category": "personal", "difficulty": "easy",
        "bullets": [
            "When and where it happened",
            "Who you helped",
            "What you did",
            "And explain how you felt afterwards",
        ],
        "follow_up_questions": [
            "Why do people help strangers?",
            "Is volunteering more common today than in the past?",
            "Should schools require students to do community service?",
        ],
    },
    {
        "topic": "Describe a difficult decision you had to make",
        "category": "personal", "difficulty": "hard",
        "bullets": [
            "What the decision was about",
            "What options you had",
            "What you finally chose",
            "And explain how you feel about the decision now",
        ],
        "follow_up_questions": [
            "Are big decisions better made quickly or slowly?",
            "Should people seek advice or trust their own judgement?",
            "Has technology made decision-making easier or harder?",
        ],
    },
    {
        "topic": "Describe a time you tried something for the first time",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "What it was",
            "When and where it happened",
            "How you felt during it",
            "And explain whether you would do it again",
        ],
        "follow_up_questions": [
            "Why do some people enjoy new experiences while others avoid them?",
            "Should children be encouraged to try unfamiliar activities?",
            "Has globalisation made it easier to try new things?",
        ],
    },
    {
        "topic": "Describe a time you were late for something important",
        "category": "personal", "difficulty": "easy",
        "bullets": [
            "What event it was",
            "Why you were late",
            "What happened as a result",
            "And explain what you learned from it",
        ],
        "follow_up_questions": [
            "Is punctuality valued equally in every culture?",
            "What are common reasons for being late?",
            "How can people manage their time better?",
        ],
    },
    {
        "topic": "Describe a goal you achieved that you are proud of",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "What the goal was",
            "How you worked towards it",
            "What obstacles you faced",
            "And explain why you are proud of it",
        ],
        "follow_up_questions": [
            "Why is it important to set goals?",
            "Should goals be ambitious or realistic?",
            "How do families influence the goals young people set?",
        ],
    },
    {
        "topic": "Describe a mistake you learned a valuable lesson from",
        "category": "personal", "difficulty": "hard",
        "bullets": [
            "What the mistake was",
            "When and where it happened",
            "What you learned from it",
            "And explain how the lesson has helped you",
        ],
        "follow_up_questions": [
            "Do people learn more from success or failure?",
            "Should children be allowed to make their own mistakes?",
            "How can workplaces create a culture that tolerates mistakes?",
        ],
    },

    # -- Objects --
    {
        "topic": "Describe an item of technology you use every day",
        "category": "technology", "difficulty": "easy",
        "bullets": [
            "What it is",
            "How long you have used it",
            "What you use it for",
            "And explain how it has changed your life",
        ],
        "follow_up_questions": [
            "How has technology changed daily life in the last decade?",
            "Is technology making people more or less social?",
            "What technology will become essential in the next ten years?",
        ],
    },
    {
        "topic": "Describe an object you own that has sentimental value",
        "category": "object", "difficulty": "medium",
        "bullets": [
            "What it is",
            "Where you got it from",
            "How long you have had it",
            "And explain why it matters to you",
        ],
        "follow_up_questions": [
            "Why do people keep objects with sentimental value?",
            "Has consumer culture changed how attached people get to possessions?",
            "Is it healthy to be very attached to objects?",
        ],
    },
    {
        "topic": "Describe a gift you remember receiving",
        "category": "object", "difficulty": "easy",
        "bullets": [
            "What the gift was",
            "Who gave it to you",
            "What occasion it was for",
            "And explain why it was memorable",
        ],
        "follow_up_questions": [
            "What makes a good gift?",
            "Are physical or experiential gifts better?",
            "Has gift-giving changed in your culture?",
        ],
    },
    {
        "topic": "Describe a piece of clothing that you wear often",
        "category": "object", "difficulty": "easy",
        "bullets": [
            "What it is",
            "When and where you got it",
            "When and where you wear it",
            "And explain why you like it",
        ],
        "follow_up_questions": [
            "Why does fashion matter to many people?",
            "How does clothing reflect culture?",
            "Should companies be more sustainable in clothing production?",
        ],
    },

    # -- Events --
    {
        "topic": "Describe a celebration or festival that is important in your country",
        "category": "event", "difficulty": "medium",
        "bullets": [
            "What the festival is",
            "When it takes place",
            "How people celebrate it",
            "And explain why it is important",
        ],
        "follow_up_questions": [
            "Why do festivals matter in modern societies?",
            "How have traditional festivals changed over time?",
            "Do festivals bring people together or just sell products?",
        ],
    },
    {
        "topic": "Describe an enjoyable event from your childhood",
        "category": "event", "difficulty": "easy",
        "bullets": [
            "What the event was",
            "Where and when it happened",
            "Who was with you",
            "And explain why it was enjoyable",
        ],
        "follow_up_questions": [
            "How do childhood experiences shape adults?",
            "Are children today happier than children in the past?",
            "What activities should children do more of?",
        ],
    },
    {
        "topic": "Describe a wedding you attended",
        "category": "event", "difficulty": "medium",
        "bullets": [
            "Whose wedding it was",
            "Where it was held",
            "What happened at the wedding",
            "And explain how you felt about it",
        ],
        "follow_up_questions": [
            "How are weddings celebrated in your country?",
            "Are big weddings worth the cost?",
            "How are marriage traditions changing globally?",
        ],
    },
    {
        "topic": "Describe a sports event you watched or attended",
        "category": "event", "difficulty": "medium",
        "bullets": [
            "What sport it was",
            "Where and when",
            "What happened",
            "And explain why it was memorable",
        ],
        "follow_up_questions": [
            "Why do people enjoy watching sports?",
            "Should governments fund elite sport?",
            "How does sport bring people together?",
        ],
    },

    # -- Education --
    {
        "topic": "Describe a subject you enjoyed studying at school",
        "category": "education", "difficulty": "easy",
        "bullets": [
            "What the subject was",
            "When you studied it",
            "What you learnt",
            "And explain why you enjoyed it",
        ],
        "follow_up_questions": [
            "Should students choose their own subjects?",
            "Is school harder today than 20 years ago?",
            "How important are practical skills in education?",
        ],
    },
    {
        "topic": "Describe a skill you would like to learn",
        "category": "education", "difficulty": "easy",
        "bullets": [
            "What the skill is",
            "How you would learn it",
            "How long it would take",
            "And explain why you want to learn it",
        ],
        "follow_up_questions": [
            "Are some skills harder to learn as adults?",
            "Is online learning as effective as in-person?",
            "Which skills will matter most in the future?",
        ],
    },
    {
        "topic": "Describe a useful piece of advice you received",
        "category": "education", "difficulty": "medium",
        "bullets": [
            "What the advice was",
            "Who gave it",
            "When you received it",
            "And explain how it helped you",
        ],
        "follow_up_questions": [
            "Are people more likely to seek advice today than in the past?",
            "When is unsolicited advice helpful or unhelpful?",
            "Should advice come from experts or experienced friends?",
        ],
    },
    {
        "topic": "Describe a course or training you would like to take",
        "category": "education", "difficulty": "medium",
        "bullets": [
            "What the course is about",
            "Why you want to take it",
            "How long it would last",
            "And explain how it would help your career or life",
        ],
        "follow_up_questions": [
            "Should employers pay for employee training?",
            "Are short courses as valuable as university degrees?",
            "How is lifelong learning changing the workforce?",
        ],
    },

    # -- Work --
    {
        "topic": "Describe a job you would like to have in the future",
        "category": "work", "difficulty": "medium",
        "bullets": [
            "What the job is",
            "What qualifications it requires",
            "What duties it would involve",
            "And explain why it appeals to you",
        ],
        "follow_up_questions": [
            "Has the idea of a 'good job' changed in recent years?",
            "Should young people prioritise passion or salary?",
            "How will automation reshape careers in the next 20 years?",
        ],
    },
    {
        "topic": "Describe a person you know who has an interesting job",
        "category": "work", "difficulty": "medium",
        "bullets": [
            "Who they are",
            "What their job is",
            "What their daily routine is like",
            "And explain why you find it interesting",
        ],
        "follow_up_questions": [
            "Why do some jobs seem more glamorous than others?",
            "Should workers be paid based on social value?",
            "How important is work-life balance?",
        ],
    },
    {
        "topic": "Describe a project you worked on with other people",
        "category": "work", "difficulty": "medium",
        "bullets": [
            "What the project was",
            "Who else was involved",
            "What your role was",
            "And explain what the outcome was",
        ],
        "follow_up_questions": [
            "What makes teamwork successful?",
            "Are remote teams as effective as in-person teams?",
            "How should teams handle disagreements?",
        ],
    },

    # -- Media & entertainment --
    {
        "topic": "Describe a film that left a strong impression on you",
        "category": "media", "difficulty": "medium",
        "bullets": [
            "What the film was about",
            "When and where you watched it",
            "Who was in it",
            "And explain why it left an impression",
        ],
        "follow_up_questions": [
            "Are films better at telling stories than books?",
            "Should governments protect local film industries?",
            "How has streaming changed how people watch films?",
        ],
    },
    {
        "topic": "Describe a song or piece of music you like",
        "category": "media", "difficulty": "easy",
        "bullets": [
            "What it is",
            "Who performs it",
            "When you usually listen to it",
            "And explain why you like it",
        ],
        "follow_up_questions": [
            "Why is music important to so many people?",
            "Has music changed in the last decade?",
            "Should music be taught in schools?",
        ],
    },
    {
        "topic": "Describe a book you enjoyed reading",
        "category": "media", "difficulty": "medium",
        "bullets": [
            "What the book is about",
            "When you read it",
            "What you learnt from it",
            "And explain why you enjoyed it",
        ],
        "follow_up_questions": [
            "Are people reading more or less than they used to?",
            "Should libraries still be funded by governments?",
            "How have e-books changed reading habits?",
        ],
    },
    {
        "topic": "Describe a TV programme you watch regularly",
        "category": "media", "difficulty": "easy",
        "bullets": [
            "What the programme is",
            "When it is on",
            "What it is about",
            "And explain why you enjoy it",
        ],
        "follow_up_questions": [
            "Has TV become more or less influential than the internet?",
            "Are streaming platforms changing what TV looks like?",
            "Should there be limits on screen time for children?",
        ],
    },

    # -- Environment --
    {
        "topic": "Describe a place you visited that has beautiful nature",
        "category": "environment", "difficulty": "medium",
        "bullets": [
            "Where the place is",
            "When you went",
            "What you saw",
            "And explain why it was beautiful",
        ],
        "follow_up_questions": [
            "Why do people enjoy nature?",
            "How can governments protect natural spaces?",
            "Has urbanisation affected our relationship with nature?",
        ],
    },
    {
        "topic": "Describe a small change that could improve your local area",
        "category": "environment", "difficulty": "hard",
        "bullets": [
            "What the change would be",
            "Why it is needed",
            "Who would benefit",
            "And explain how you would persuade others to support it",
        ],
        "follow_up_questions": [
            "Should citizens be more involved in local decisions?",
            "What environmental issues affect your country most?",
            "How can communities work together to solve problems?",
        ],
    },
    {
        "topic": "Describe an environmental problem you are concerned about",
        "category": "environment", "difficulty": "hard",
        "bullets": [
            "What the problem is",
            "What causes it",
            "Who is affected",
            "And explain why it concerns you",
        ],
        "follow_up_questions": [
            "Should governments or individuals lead on environmental issues?",
            "Will technology solve the climate crisis?",
            "How can education raise environmental awareness?",
        ],
    },

    # -- Custom / lifestyle --
    {
        "topic": "Describe a hobby that helps you relax",
        "category": "personal", "difficulty": "easy",
        "bullets": [
            "What the hobby is",
            "When you started it",
            "How often you do it",
            "And explain why it helps you relax",
        ],
        "follow_up_questions": [
            "Why are hobbies important?",
            "Are people in your country more or less active than before?",
            "Should employers encourage hobbies among staff?",
        ],
    },
    {
        "topic": "Describe a meal you particularly enjoyed",
        "category": "personal", "difficulty": "easy",
        "bullets": [
            "What the meal was",
            "Where you ate it",
            "Who you were with",
            "And explain why you enjoyed it",
        ],
        "follow_up_questions": [
            "How is food connected to culture?",
            "Are home-cooked meals declining in popularity?",
            "Should fast food be regulated more strictly?",
        ],
    },
    {
        "topic": "Describe an interesting conversation you had recently",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "Who the conversation was with",
            "Where and when it happened",
            "What you talked about",
            "And explain why you found it interesting",
        ],
        "follow_up_questions": [
            "Are conversations harder in the digital age?",
            "How do you start a conversation with a stranger?",
            "Should people share opinions or just facts?",
        ],
    },
    {
        "topic": "Describe a time you waited a long time for something",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "What you were waiting for",
            "How long you waited",
            "Why it took so long",
            "And explain how you felt during the wait",
        ],
        "follow_up_questions": [
            "Are people more impatient today than before?",
            "Why is patience considered a virtue?",
            "How does waiting affect mental health?",
        ],
    },
    {
        "topic": "Describe a time you received good news",
        "category": "personal", "difficulty": "easy",
        "bullets": [
            "What the news was",
            "Where and when you heard it",
            "Who shared it with you",
            "And explain how you reacted",
        ],
        "follow_up_questions": [
            "Why do people share good news with others?",
            "Has social media changed how news is shared?",
            "Are people more drawn to good or bad news?",
        ],
    },
    {
        "topic": "Describe a time you saved money for something special",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "What you saved for",
            "How long it took",
            "How you saved",
            "And explain how you felt when you achieved it",
        ],
        "follow_up_questions": [
            "Should children be taught to save money?",
            "Is it better to save or spend?",
            "How has digital banking changed saving habits?",
        ],
    },
    {
        "topic": "Describe a piece of news you remember well",
        "category": "media", "difficulty": "medium",
        "bullets": [
            "What the news was",
            "Where you heard it",
            "What was your reaction",
            "And explain why you remember it",
        ],
        "follow_up_questions": [
            "How has the way people get news changed?",
            "Should news outlets be neutral?",
            "Is too much news bad for mental health?",
        ],
    },
    {
        "topic": "Describe a time you helped someone learn something",
        "category": "education", "difficulty": "medium",
        "bullets": [
            "What you helped them learn",
            "Who they were",
            "How you taught them",
            "And explain how you felt about it",
        ],
        "follow_up_questions": [
            "What makes teaching satisfying?",
            "Should everyone teach at some point in their life?",
            "How can people teach more effectively online?",
        ],
    },
    {
        "topic": "Describe a problem you solved through online research",
        "category": "technology", "difficulty": "medium",
        "bullets": [
            "What the problem was",
            "How you researched it",
            "What sources you used",
            "And explain how you finally solved it",
        ],
        "follow_up_questions": [
            "Are search engines reliable sources of information?",
            "How do people verify what they read online?",
            "Has the internet improved problem-solving in everyday life?",
        ],
    },
    {
        "topic": "Describe an app on your phone you find very useful",
        "category": "technology", "difficulty": "easy",
        "bullets": [
            "What the app is",
            "How long you have used it",
            "What it does",
            "And explain why you find it useful",
        ],
        "follow_up_questions": [
            "Are mobile apps replacing traditional websites?",
            "Should apps be free or paid?",
            "How can users protect their privacy when using apps?",
        ],
    },
    {
        "topic": "Describe a programme on TV or online that teaches you something",
        "category": "education", "difficulty": "medium",
        "bullets": [
            "What it is",
            "What it teaches",
            "How long you have watched it",
            "And explain why it is useful",
        ],
        "follow_up_questions": [
            "Is entertainment a good way to learn?",
            "Should educational content be free?",
            "How can creators make learning enjoyable?",
        ],
    },
    {
        "topic": "Describe a game you enjoy playing",
        "category": "media", "difficulty": "easy",
        "bullets": [
            "What the game is",
            "When you started playing",
            "Who you usually play with",
            "And explain why you enjoy it",
        ],
        "follow_up_questions": [
            "Are video games good or bad for children?",
            "Should playing games count as a sport?",
            "How have games changed in the last decade?",
        ],
    },
    {
        "topic": "Describe a small business you would like to start",
        "category": "work", "difficulty": "hard",
        "bullets": [
            "What the business would do",
            "Where it would be located",
            "Who your customers would be",
            "And explain why you think it would succeed",
        ],
        "follow_up_questions": [
            "Should governments help small businesses more?",
            "Why do many small businesses fail?",
            "Is starting a business riskier or easier today?",
        ],
    },
    {
        "topic": "Describe an interview you had — for school, work, or a visa",
        "category": "personal", "difficulty": "hard",
        "bullets": [
            "What it was for",
            "How you prepared",
            "What questions were asked",
            "And explain how you performed",
        ],
        "follow_up_questions": [
            "Are interviews a fair way to assess people?",
            "How can someone make a good first impression?",
            "Should interviews be replaced by tests?",
        ],
    },
    {
        "topic": "Describe a website you use often",
        "category": "technology", "difficulty": "easy",
        "bullets": [
            "What it is",
            "How often you use it",
            "What you do on it",
            "And explain why you use it so much",
        ],
        "follow_up_questions": [
            "Has the internet made information equal?",
            "Should websites pay users for their data?",
            "How do you decide what websites to trust?",
        ],
    },
    {
        "topic": "Describe a positive change you have made in your lifestyle",
        "category": "personal", "difficulty": "medium",
        "bullets": [
            "What the change was",
            "When and why you made it",
            "How you stuck with it",
            "And explain how it has affected you",
        ],
        "follow_up_questions": [
            "Why is it hard to change habits?",
            "Should governments encourage healthier lifestyles?",
            "Is it better to change gradually or quickly?",
        ],
    },
    {
        "topic": "Describe a piece of art you saw and liked",
        "category": "media", "difficulty": "medium",
        "bullets": [
            "What it was",
            "Where you saw it",
            "Who created it",
            "And explain why you liked it",
        ],
        "follow_up_questions": [
            "Should art be funded by governments?",
            "Is art a luxury or a necessity?",
            "How has digital art changed the art world?",
        ],
    },
]


class Command(BaseCommand):
    help = "Seed the global Part 2 cue card bank (idempotent)."

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for card in CARDS:
            obj, was_created = CueCard.objects.update_or_create(
                institute=None, topic=card["topic"],
                defaults={
                    "category": card["category"],
                    "difficulty": card["difficulty"],
                    "bullets": card["bullets"],
                    "follow_up_questions": card.get("follow_up_questions", []),
                    "is_active": True,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f"Cue cards: created={created}, updated={updated}, total in bank={CueCard.objects.count()}"
        ))
