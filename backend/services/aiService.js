/**
 * AI Service - OpenAI API 연동 댓글 생성
 *
 * Functions:
 * - generateComments: 영상 제목 기반 자연스러운 한국어 댓글 생성
 * - generateCommentsForJob: Job에 댓글 생성 후 DB 저장
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OpenAI = require('openai');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('[AIService] OPENAI_API_KEY not set - AI comment generation disabled');
}

const openai = apiKey ? new OpenAI({ apiKey }) : null;

/**
 * Generate natural Korean YouTube comments using OpenAI
 * @param {string} videoTitle - Video title for context
 * @param {number} count - Number of comments to generate (default: 10)
 * @param {Object} options - Additional options
 * @param {string} options.tone - Comment tone: 'casual' | 'positive' | 'mixed' (default: 'casual')
 * @param {string} options.language - Language: 'ko' | 'en' (default: 'ko')
 * @returns {Promise<string[]>} - Array of generated comment strings
 */
async function generateComments(videoTitle, count = 10, options = {}) {
  if (!openai) {
    console.error('[AIService] OpenAI client not initialized (missing API key)');
    return [];
  }

  const { tone = 'casual', language = 'ko' } = options;

  const toneGuide = {
    casual: '자연스럽고 캐주얼한 유튜브 시청자 말투. 가끔 ㅋㅋㅋ, ㄹㅇ, ㅎㅎ 같은 인터넷 슬랭과 이모지 사용.',
    positive: '긍정적이고 호의적인 시청자 말투. 영상 내용을 칭찬하고 구독을 언급.',
    mixed: '다양한 반응 (긍정, 감탄, 질문, 공감 등) 골고루 섞기. 너무 한쪽으로 치우치지 않게.',
  };

  const languageGuide = language === 'ko'
    ? '한국어로 작성. 반말/존댓말 자연스럽게 섞기.'
    : 'Write in English. Mix casual and polite tones.';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a witty Korean YouTube viewer. Output ONLY a JSON object with a "comments" key containing an array of strings. No other text.`
        },
        {
          role: 'user',
          content: `Generate ${count} natural, unique YouTube comments for a video titled "${videoTitle}".

Rules:
- ${toneGuide[tone] || toneGuide.casual}
- ${languageGuide}
- 각 댓글은 10~80자 사이 (너무 짧거나 길지 않게)
- 중복되거나 비슷한 댓글 없이 다양하게
- 봇처럼 보이지 않도록 자연스러운 오타나 구어체 포함
- 댓글 앞에 번호 붙이지 말 것

Output format: {"comments": ["댓글1", "댓글2", ...]}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 2000,
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Handle various JSON structures
    const comments = parsed.comments || parsed.data || (Array.isArray(parsed) ? parsed : []);

    if (!Array.isArray(comments)) {
      console.error('[AIService] Unexpected response structure:', Object.keys(parsed));
      return [];
    }

    // Filter and clean
    const cleaned = comments
      .filter(c => typeof c === 'string' && c.trim().length > 0)
      .map(c => c.trim());

    console.log(`[AIService] Generated ${cleaned.length}/${count} comments for "${videoTitle.slice(0, 30)}..."`);
    return cleaned;

  } catch (error) {
    console.error('[AIService] Generation failed:', error.message);
    return [];
  }
}

/**
 * Generate comments and save to Supabase for a specific job
 * @param {Object} supabase - Supabase client
 * @param {string} jobId - Job ID to attach comments to
 * @param {string} videoTitle - Video title for generation context
 * @param {number} count - Number of comments
 * @returns {Promise<{generated: number, saved: number}>}
 */
async function generateCommentsForJob(supabase, jobId, videoTitle, count = 10) {
  const comments = await generateComments(videoTitle, count);

  if (comments.length === 0) {
    return { generated: 0, saved: 0 };
  }

  // Bulk insert into comments table
  const commentRecords = comments.map(content => ({
    job_id: jobId,
    content,
    is_used: false,
  }));

  const { data, error } = await supabase
    .from('comments')
    .insert(commentRecords)
    .select('id');

  if (error) {
    console.error('[AIService] DB insert error:', error.message);
    return { generated: comments.length, saved: 0 };
  }

  const savedCount = data?.length || 0;
  console.log(`[AIService] Saved ${savedCount} AI comments for job ${jobId}`);
  return { generated: comments.length, saved: savedCount };
}

module.exports = {
  generateComments,
  generateCommentsForJob,
};
