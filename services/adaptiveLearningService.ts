/**
 * @file This service contains the logic for the adaptive learning algorithm.
 * It analyzes user performance history to calculate current skill levels and
 * determine the appropriate difficulty for new practice materials.
 */

import { WritingSessionSummary, ReadingSessionSummary, ListeningSessionSummary, SpeakingSessionSummary, QuizDifficulty } from '../types';

const SESSION_COUNT_FOR_AVERAGE = 5;
const MINIMUM_SESSIONS_FOR_ADAPTATION = 2;

/**
 * Converts a percentage score (0-100) to an approximate IELTS band score.
 * This provides a consistent metric for Reading and Listening sections.
 * @param {number} percentage - The user's percentage score.
 * @returns {number} An approximate IELTS band score.
 */
export const scoreToBand = (percentage: number): number => {
    if (percentage >= 94) return 9.0;
    if (percentage >= 88) return 8.5;
    if (percentage >= 81) return 8.0;
    if (percentage >= 75) return 7.5;
    if (percentage >= 69) return 7.0;
    if (percentage >= 63) return 6.5;
    if (percentage >= 56) return 6.0;
    if (percentage >= 50) return 5.5;
    if (percentage >= 44) return 5.0;
    return 4.5;
};

/**
 * Calculates the current estimated skill level for Writing.
 * @param {WritingSessionSummary[]} history - The user's writing session history.
 * @returns {number | null} The calculated band score or null if not enough data.
 */
export const calculateWritingSkill = (history: WritingSessionSummary[]): number | null => {
    const recentSessions = history.slice(0, SESSION_COUNT_FOR_AVERAGE);
    if (recentSessions.length < MINIMUM_SESSIONS_FOR_ADAPTATION) {
        return null;
    }
    const totalScore = recentSessions.reduce((sum, session) => sum + session.bandScore, 0);
    return totalScore / recentSessions.length;
};

/**
 * Calculates the current estimated skill level for Speaking.
 * @param {SpeakingSessionSummary[]} history - The user's speaking session history.
 * @returns {number | null} The calculated band score or null if not enough data.
 */
export const calculateSpeakingSkill = (history: SpeakingSessionSummary[]): number | null => {
    const recentAnalyzedSessions = history
        .filter(s => s.speakingAnalysis)
        .slice(0, SESSION_COUNT_FOR_AVERAGE);

    if (recentAnalyzedSessions.length < MINIMUM_SESSIONS_FOR_ADAPTATION) {
        return null;
    }
    const totalScore = recentAnalyzedSessions.reduce((sum, session) => sum + session.speakingAnalysis!.overallBandScore, 0);
    return totalScore / recentAnalyzedSessions.length;
};

/**
 * Calculates the current estimated skill level for Reading.
 * @param {ReadingSessionSummary[]} history - The user's reading session history.
 * @returns {number | null} The calculated band score or null if not enough data.
 */
export const calculateReadingSkill = (history: ReadingSessionSummary[]): number | null => {
    const recentSessions = history.slice(0, SESSION_COUNT_FOR_AVERAGE);
    if (recentSessions.length < MINIMUM_SESSIONS_FOR_ADAPTATION) {
        return null;
    }
    const totalPercentage = recentSessions.reduce((sum, session) => {
        const percentage = session.totalQuestions > 0 ? (session.score / session.totalQuestions) * 100 : 0;
        return sum + percentage;
    }, 0);
    const avgPercentage = totalPercentage / recentSessions.length;
    return scoreToBand(avgPercentage);
};

/**
 * Calculates the current estimated skill level for Listening.
 * @param {ListeningSessionSummary[]} history - The user's listening session history.
 * @returns {number | null} The calculated band score or null if not enough data.
 */
export const calculateListeningSkill = (history: ListeningSessionSummary[]): number | null => {
    const recentSessions = history.slice(0, SESSION_COUNT_FOR_AVERAGE);
     if (recentSessions.length < MINIMUM_SESSIONS_FOR_ADAPTATION) {
        return null;
    }
    const totalPercentage = recentSessions.reduce((sum, session) => {
        const percentage = session.totalQuestions > 0 ? (session.score / session.totalQuestions) * 100 : 0;
        return sum + percentage;
    }, 0);
    const avgPercentage = totalPercentage / recentSessions.length;
    return scoreToBand(avgPercentage);
};


/**
 * Calculates an overall skill level by averaging the available skill scores.
 * @param {object} histories - An object containing all session histories.
 * @returns {number | null} The average band score or null if no scores could be calculated.
 */
export const calculateOverallSkill = (histories: {
    writing: WritingSessionSummary[],
    speaking: SpeakingSessionSummary[],
    reading: ReadingSessionSummary[],
    listening: ListeningSessionSummary[]
}): number | null => {
    const skills = [
        calculateWritingSkill(histories.writing),
        calculateSpeakingSkill(histories.speaking),
        calculateReadingSkill(histories.reading),
        calculateListeningSkill(histories.listening)
    ].filter((score): score is number => score !== null);

    if (skills.length === 0) {
        return null;
    }

    const totalSkill = skills.reduce((sum, score) => sum + score, 0);
    return totalSkill / skills.length;
};

/**
 * Maps a band score to a quiz difficulty level.
 * @param {number} bandScore - The user's estimated band score.
 * @returns {QuizDifficulty} The corresponding quiz difficulty.
 */
export const bandToDifficulty = (bandScore: number): QuizDifficulty => {
    if (bandScore >= 7.5) return 'Hard';
    if (bandScore >= 6.0) return 'Medium';
    return 'Easy';
};