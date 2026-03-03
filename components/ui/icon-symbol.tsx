import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  // Inkform tabs
  "wand.and.stars": "auto-awesome",
  "photo.on.rectangle.angled": "photo-library",
  "arrow.up.forward.square": "open-in-new",
  "text.quote": "format-quote",
  "gearshape.fill": "settings",
  // Additional icons
  "star.fill": "star",
  "star": "star-border",
  "trash.fill": "delete",
  "square.and.arrow.up": "share",
  "xmark": "close",
  "checkmark": "check",
  "plus": "add",
  "minus": "remove",
  "magnifyingglass": "search",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "photo.fill": "image",
  "doc.on.doc": "content-copy",
  "bookmark.fill": "bookmark",
  "bookmark": "bookmark-border",
  "clock.fill": "history",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  "info.circle.fill": "info",
  "exclamationmark.triangle.fill": "warning",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
