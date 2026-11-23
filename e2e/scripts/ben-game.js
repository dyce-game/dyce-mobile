// Ben (API) plays his side of the newest game in his chat with Alice, as his app would. Set BEN_ACTION:
//   accept        accept the invite
//   counter       counter a Pool invite with COUNTER_KOBO (0 = play it free)
//   decline       decline the invite
//   word-hunt     start the round and send an empty word list (a finished round for Ben)
//   pig-roll-out  roll and hold until Ben has reached the target (the Pig reference game), see PIG_ROLLS
var h = { 'content-type': 'application/json', authorization: 'Bearer ' + BEN_TOKEN };
function get(path) {
  return json(http.get(API_URL + path, { headers: h }).body);
}
function post(path, body) {
  var r = http.post(API_URL + path, { headers: h, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error('POST ' + path + ' -> ' + r.status + ' ' + r.body);
  return r.body ? json(r.body) : {};
}
var chats = get('/conversations?filter=friends').conversations;
var chat = chats.filter(function (c) {
  return c.peer && c.peer.username === ALICE_USERNAME;
})[0];
if (!chat) throw new Error('Ben has no chat with Alice');
var msgs = get('/conversations/' + chat.id + '/messages').messages.filter(function (m) {
  return m.kind === 'game';
});
if (!msgs.length) throw new Error('no game card in the chat');
var matchId = msgs[msgs.length - 1].payload.matchId;
output.matchId = matchId;

if (BEN_ACTION === 'accept') post('/matches/' + matchId + '/accept');
else if (BEN_ACTION === 'decline') post('/matches/' + matchId + '/decline');
else if (BEN_ACTION === 'counter')
  post('/matches/' + matchId + '/counter', { stakeKobo: Number(COUNTER_KOBO) });
else if (BEN_ACTION === 'word-hunt') {
  var m = get('/matches/' + matchId);
  m = post('/matches/' + matchId + '/moves', {
    expectedVersion: m.stateVersion,
    action: { kind: 'start' },
  });
  m = get('/matches/' + matchId);
  post('/matches/' + matchId + '/moves', {
    expectedVersion: m.stateVersion,
    action: { kind: 'submit', words: [] },
  });
} else throw new Error('unknown BEN_ACTION ' + BEN_ACTION);
