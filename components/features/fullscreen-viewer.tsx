import React from "react";
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import type { GalleryImage } from "@/lib/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

interface FullscreenViewerProps {
  image: Partial<GalleryImage>;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  onCopyPrompt: () => void;
  colors: {
    primary: string;
    [key: string]: string;
  };
}

export function FullscreenViewer({
  image,
  onClose,
  onSave,
  onShare,
  onCopyPrompt,
  colors,
}: FullscreenViewerProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(6, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1, { duration: 200 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;
        translateX.value = Math.max(
          -maxX,
          Math.min(maxX, savedTranslateX.value + e.translationX)
        );
        translateY.value = Math.max(
          -maxY,
          Math.min(maxY, savedTranslateY.value + e.translationY)
        );
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((_e, success) => {
      if (!success) return;
      if (savedScale.value > 1.05) {
        scale.value = withTiming(1, { duration: 250 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(0, { duration: 250 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: 250 });
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Exclusive(
    Gesture.Simultaneous(pinchGesture, panGesture),
    doubleTapGesture
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={viewerStyles.overlay}>
          {/* Top bar */}
          <View style={viewerStyles.topBar}>
            <TouchableOpacity
              onPress={onClose}
              style={viewerStyles.closeBtn}
            >
              <Text style={viewerStyles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <View style={viewerStyles.topActions}>
              <TouchableOpacity
                onPress={onCopyPrompt}
                style={viewerStyles.topBtn}
              >
                <Text style={viewerStyles.topBtnText}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onShare}
                style={viewerStyles.topBtn}
              >
                <Text style={viewerStyles.topBtnText}>↗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                style={[
                  viewerStyles.topBtn,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={viewerStyles.topBtnText}>💾 Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Zoomable image */}
          <GestureDetector gesture={composed}>
            <Animated.View
              style={[viewerStyles.imageContainer, animatedStyle]}
            >
              <Image
                source={{ uri: image.uri }}
                style={{
                  width: SCREEN_WIDTH,
                  height: SCREEN_HEIGHT * 0.8,
                }}
                contentFit="contain"
              />
            </Animated.View>
          </GestureDetector>

          {/* Bottom bar */}
          <View style={viewerStyles.bottomBar}>
            <Text
              style={viewerStyles.bottomModel}
              numberOfLines={1}
            >
              {image.model} · {image.provider}
            </Text>
            <Text style={viewerStyles.hint}>
              Pinch to zoom · Double-tap to zoom in/out
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 12,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  topBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  imageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
  },
  bottomModel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
  },
});
