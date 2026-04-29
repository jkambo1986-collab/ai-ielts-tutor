/**
 * @file Tiny seed prompt rotator — used by the Today page until the AI
 * service produces personalised daily prompts.
 */

const PROMPTS = [
    'Some people think technology is making us less social. To what extent do you agree?',
    'In many countries, the gap between the rich and the poor is increasing. What problems does this cause and how can it be addressed?',
    'Some believe higher education should be free; others believe students should pay. Discuss both views and give your opinion.',
    'Working from home has become more common. Discuss the advantages and disadvantages.',
    'Some argue cities should be designed to give priority to bicycles and pedestrians over cars. Do you agree?',
    'Many young people leave their home country to work abroad. What are the causes and effects?',
    'Some feel that environmental problems are too big for individuals to solve. To what extent do you agree?',
    'Children today spend less time on physical activities than in the past. What are the reasons and how can this be improved?',
];

export function generateRandomWritingPrompt(): string {
    return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}
