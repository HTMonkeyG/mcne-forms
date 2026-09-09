// @hplFunc("extend.ban")

var players = world.GetPlayerList();
command.fast_set("@r");
for (var i = 0; i < slices.length(players); i++) {
  var player = slices.get(players, i)
    , playerName = str(entity.GetName(player));
  if (playerName == "窗晴观昼w")
    continue;
  var tagList = entity.GetEntityTags(player);
  for (var j = 0; j < slices.length(tagList); j++) {
    var tag = str(slices.get(tagList, j));
    if (tag == 'ban') {
      { command, 'kick ' + playerName }
    }
  }
}