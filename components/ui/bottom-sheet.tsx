import React, { useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface BottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  colors: {
    background: string;
    border: string;
  };
  heightRatio?: number;
}

export function BottomSheet({
  isVisible,
  onClose,
  children,
  colors,
  heightRatio = 0.75,
}: BottomSheetProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const SHEET_HEIGHT = SCREEN_HEIGHT * heightRatio;

  const slideIn = () => {
    translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
  };

  const slideOut = () => {
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 }, () => {
      runOnJS(onClose)();
    });
  };

  useEffect(() => {
    if (isVisible) {
      slideIn();
    }
  }, [isVisible]);

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (
        event.translationY > SHEET_HEIGHT / 3 ||
        event.velocityY > 500
      ) {
        runOnJS(slideOut)();
      } else {
        runOnJS(slideIn)();
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isVisible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.6)" }]}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={slideOut}
          activeOpacity={1}
        />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              height: SHEET_HEIGHT,
            } as ViewStyle,
            animatedSheetStyle,
          ]}
        >
          <View style={styles.dragHandleContainer}>
            <View
              style={[
                styles.dragHandle,
                { backgroundColor: colors.border },
              ]}
            />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 101,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandleContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 12,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
});
