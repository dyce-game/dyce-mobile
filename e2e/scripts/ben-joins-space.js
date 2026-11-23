// Ben (API) joins Alice's newest space by its code, as his app would after he types it on "Join a space".
var h = { 'content-type': 'application/json', authorization: 'Bearer ' + BEN_TOKEN };
var mine = json(
  http.get(API_URL + '/spaces', { headers: { authorization: 'Bearer ' + ALICE_TOKEN } }).body,
);
var list = mine.spaces || mine.items || mine;
var space =
  list.filter(function (s) {
    return s.status === 'open' || s.status === 'lobby' || s.status === 'waiting';
  })[0] || list[0];
if (!space) throw new Error('Alice has no space');
var res = http.post(API_URL + '/spaces/join', {
  headers: h,
  body: JSON.stringify({ code: space.code }),
});
if (!res.ok)
  throw new Error('Ben could not join ' + space.code + ': ' + res.status + ' ' + res.body);
output.spaceCode = space.code;
output.spaceId = space.id;
