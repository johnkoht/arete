/**
 * Test preload (via NODE_OPTIONS=--import) that stubs global fetch for
 * api.anthropic.com so CLI subprocess tests can exercise the REAL extract
 * command path end-to-end with zero network/LLM calls.
 *
 * The canned assistant text comes from ARETE_TEST_LLM_RESPONSE (a JSON string
 * the meeting-extraction parser accepts). Every Anthropic call in the
 * subprocess returns the same text as a minimal messages SSE stream, which is
 * what pi-ai's anthropic provider (stream: true via @anthropic-ai/sdk)
 * consumes. Non-Anthropic URLs pass through to the real fetch.
 */

const realFetch = globalThis.fetch;
const cannedText = process.env.ARETE_TEST_LLM_RESPONSE ?? '{}';

function sseBody(text) {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-3-haiku-20240307',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ];
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('api.anthropic.com')) {
    return realFetch(input, init);
  }
  return new Response(sseBody(cannedText), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};
