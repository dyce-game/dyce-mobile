// Ben (API) sends Alice a message in their chat, as his app would; the text is in ${BEN_SAYS}.
var h = { 'content-type': 'application/json', authorization: 'Bearer ' + BEN_TOKEN };
var chats = json(http.get(API_URL + '/conversations?filter=friends', { headers: h }).body);
var chat = (chats.conversations || chats).filter(function (c) {
  return c.peer && c.peer.username === ALICE_USERNAME;
})[0];
if (!chat) throw new Error('Ben has no chat with Alice');
var id = 'e2e' + Date.now().toString(16) + '-0000-4000-8000-000000000000';
id =
  id.slice(0, 8) +
  '-' +
  id.slice(8, 12).padEnd(4, '0') +
  '-4000-8000-' +
  (Date.now().toString(16) + '000000000000').slice(0, 12);
var res = http.post(API_URL + '/conversations/' + chat.id + '/messages', {
  headers: h,
  body: JSON.stringify({ id: id, body: BEN_SAYS }),
});
if (!res.ok) throw new Error('Ben could not send: ' + res.status + ' ' + res.body);
