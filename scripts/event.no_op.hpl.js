// @hplEvent("PlayerPermissionChangeServerEvent", "event.no_op")

var src = maps.get(args, "causePlayerId")
  , dst = maps.get(args, "playerId")
  , cause = maps.get(args, "changeCause");

// ProgrammingInterfaceCaused, directly pass.
if (cause == 1)
  return;

// -1: deop
//  0: none
//  1: op
//var isOpChanged = int(maps.get(maps.ptr_get(args, object.ref("newPermission")), "op"))
//                - int(maps.get(maps.ptr_get(args, object.ref("oldPermission")), "op"));

//{ command, "say " + str(isOpChanged) }
// Return if op is not changed.
//return;

// Other reason, we'll have two player names
var srcName = strings.cast(entity.GetName(src));
command.fast_set(srcName);

// Check source player name white list.
if (srcName == "窗晴观昼wa" || srcName == "萌小柠_wl" || srcName == "楼雨听夜w" || srcName == "Oxygen_Lemon" || srcName == "74LS02")
  return;

var dstName = strings.cast(entity.GetName(dst));

{ command, "say " + srcName + " 尝试修改 " + dstName + " 的权限，已阻止" }

maps.set(args, "cancel", true);
