import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { Link, Flash, ShieldTick, Download } from 'reicon-react-native';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface CircuitNode {
  id: string;
  x: number;
  y: number;
  label?: string;
  icon?: React.ReactNode;
  status?: 'active' | 'inactive' | 'processing' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

export interface CircuitConnection {
  from: string;
  to: string;
  animated?: boolean;
  color?: string;
  pulseColor?: string;
  delay?: number;
}

export interface CircuitBoardProps {
  nodes?: CircuitNode[];
  connections?: CircuitConnection[];
  width?: number;
  height?: number;
  gridSize?: number;
  showGrid?: boolean;
  gridColor?: string;
  traceColor?: string;
  pulseColor?: string;
  nodeColor?: string;
  pulseSpeed?: number;
  traceWidth?: number;
  variant?: 'light' | 'dark' | 'auto';
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: any) => void;
}

/**
 * AnyFetch on-device download pipeline:
 * 1. Link (Input: User copies/pastes media URL)
 * 2. Engine (Native Stream Extractor: 1080p, 4K, audio, carousels)
 * 3. Privacy (100% On-Device Sandbox: Zero tracking/telemetry)
 * 4. Gallery (Destination: Saved straight to device storage)
 */
export const ANYFETCH_DEFAULT_NODES = (w = 330, h = 210): CircuitNode[] => [
  {
    id: 'link',
    x: Math.round(w * 0.16),
    y: Math.round(h * 0.5),
    label: 'Link',
    status: 'active',
    icon: <Link size={19} color="#E4E4E7" />,
  },
  {
    id: 'engine',
    x: Math.round(w * 0.5),
    y: Math.round(h * 0.25),
    label: 'Engine',
    status: 'processing',
    icon: <Flash size={19} color="#E4E4E7" />,
  },
  {
    id: 'privacy',
    x: Math.round(w * 0.5),
    y: Math.round(h * 0.75),
    label: 'Privacy',
    status: 'active',
    icon: <ShieldTick size={19} color="#E4E4E7" />,
  },
  {
    id: 'gallery',
    x: Math.round(w * 0.84),
    y: Math.round(h * 0.5),
    label: 'Gallery',
    status: 'active',
    icon: <Download size={19} color="#E4E4E7" />,
  },
];

/**
 * 2-Stage sequenced pulse transmission:
 * - Stage 1 (delay 0): Link transmits into Engine and Privacy
 * - Stage 2 (delay 0.5): Engine and Privacy transmit into Gallery
 */
export const ANYFETCH_DEFAULT_CONNECTIONS: CircuitConnection[] = [
  { from: 'link', to: 'engine', animated: true, delay: 0 },
  { from: 'link', to: 'privacy', animated: true, delay: 0 },
  { from: 'engine', to: 'gallery', animated: true, delay: 0.5 },
  { from: 'privacy', to: 'gallery', animated: true, delay: 0.5 },
];

function ConnectionTrace({
  conn,
  fromNode,
  toNode,
  calculatePath,
  traceWidth,
  computedTraceColor,
  computedPulseColor,
  pulseGlowColor,
  pulseSpeed,
  index,
}: {
  conn: CircuitConnection;
  fromNode: CircuitNode;
  toNode: CircuitNode;
  calculatePath: (from: CircuitNode, to: CircuitNode) => { d: string; length: number };
  traceWidth: number;
  computedTraceColor: string;
  computedPulseColor: string;
  pulseGlowColor: string;
  pulseSpeed: number;
  index: number;
}) {
  const { d, length } = calculatePath(fromNode, toNode);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (conn.animated === false) return;
    const duration = Math.max(1600, pulseSpeed * 1000);
    const startDelay = (conn.delay ?? (index * 0.25)) * duration;

    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration,
        delay: startDelay,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim, conn.animated, pulseSpeed, conn.delay, index]);

  const pulseLen = Math.max(26, Math.round(length * 0.26));
  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [pulseLen, -(length + pulseLen)],
  });

  return (
    <G>
      {/* Base trace line */}
      <Path
        d={d}
        fill="none"
        stroke={conn.color || computedTraceColor}
        strokeWidth={traceWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Electric pulse soft glow aura */}
      {conn.animated !== false && (
        <AnimatedPath
          d={d}
          fill="none"
          stroke={pulseGlowColor}
          strokeWidth={traceWidth + 3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${pulseLen} ${length + pulseLen}`}
          strokeDashoffset={strokeDashoffset as any}
        />
      )}

      {/* Electric pulse bright core beam */}
      {conn.animated !== false && (
        <AnimatedPath
          d={d}
          fill="none"
          stroke={conn.pulseColor || computedPulseColor}
          strokeWidth={traceWidth + 0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${pulseLen} ${length + pulseLen}`}
          strokeDashoffset={strokeDashoffset as any}
        />
      )}
    </G>
  );
}

export function CircuitBoard({
  nodes,
  connections,
  width = 330,
  height = 210,
  gridSize = 20,
  showGrid = true,
  gridColor,
  traceColor,
  pulseColor,
  nodeColor,
  pulseSpeed = 1.9,
  traceWidth = 1.6,
  variant = 'dark',
  style,
  onLayout,
}: CircuitBoardProps) {
  const isDark = variant !== 'light';

  const computedGridColor = gridColor || (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)');
  const computedTraceColor = traceColor || (isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(0, 0, 0, 0.18)');
  const computedPulseColor = pulseColor || '#FFFFFF';
  const pulseGlowColor = isDark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(0, 0, 0, 0.22)';
  const computedNodeBorder = nodeColor || (isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.22)');

  const actualNodes = useMemo(() => {
    return nodes && nodes.length > 0 ? nodes : ANYFETCH_DEFAULT_NODES(width, height);
  }, [nodes, width, height]);

  const actualConnections = useMemo(() => {
    return connections && connections.length > 0 ? connections : ANYFETCH_DEFAULT_CONNECTIONS;
  }, [connections]);

  const nodeMap = useMemo(() => {
    return new Map(actualNodes.map((n) => [n.id, n]));
  }, [actualNodes]);

  const getNodeSize = useCallback((size?: CircuitNode['size']) => {
    switch (size) {
      case 'sm':
        return 34;
      case 'lg':
        return 48;
      default:
        return 42;
    }
  }, []);

  const calculatePath = useCallback(
    (from: CircuitNode, to: CircuitNode) => {
      const fromSize = getNodeSize(from.size) / 2 + 3;
      const toSize = getNodeSize(to.size) / 2 + 3;

      const dx = to.x - from.x;
      const dy = to.y - from.y;

      let startX = from.x;
      let startY = from.y;
      let endX = to.x;
      let endY = to.y;

      let d = '';
      let length = 0;

      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal first, then vertical, then horizontal into target
        startX = from.x + (dx > 0 ? fromSize : -fromSize);
        endX = to.x + (dx > 0 ? -toSize : toSize);
        const midX = from.x + dx / 2;
        d = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
        length = Math.abs(midX - startX) + Math.abs(endY - startY) + Math.abs(endX - midX);
      } else {
        // Vertical first, then horizontal, then vertical into target
        startY = from.y + (dy > 0 ? fromSize : -fromSize);
        endY = to.y + (dy > 0 ? -toSize : toSize);
        const midY = from.y + dy / 2;
        d = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
        length = Math.abs(midY - startY) + Math.abs(endX - startX) + Math.abs(endY - midY);
      }

      return { d, length: Math.max(length, 80) };
    },
    [getNodeSize]
  );

  // Subtle background dot matrix
  const gridDots = useMemo(() => {
    if (!showGrid) return [];
    const dots: { x: number; y: number }[] = [];
    const step = gridSize;
    for (let x = step / 2; x < width; x += step) {
      for (let y = step / 2; y < height; y += step) {
        dots.push({ x, y });
      }
    }
    return dots;
  }, [showGrid, gridSize, width, height]);

  return (
    <View
      style={[
        s.container,
        {
          width,
          height,
        },
        style,
      ]}
      onLayout={onLayout}
    >
      {/* SVG Canvas for Traces & Grid Dots */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {/* Subtle dot matrix grid */}
        {showGrid && (
          <G opacity={0.6}>
            {gridDots.map((dot, idx) => (
              <Circle key={idx} cx={dot.x} cy={dot.y} r={0.65} fill={computedGridColor} />
            ))}
          </G>
        )}

        {/* Traces and animated pulses */}
        {actualConnections.map((conn, idx) => {
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;

          return (
            <ConnectionTrace
              key={`conn-${conn.from}-${conn.to}-${idx}`}
              conn={conn}
              fromNode={fromNode}
              toNode={toNode}
              calculatePath={calculatePath}
              traceWidth={traceWidth}
              computedTraceColor={computedTraceColor}
              computedPulseColor={computedPulseColor}
              pulseGlowColor={pulseGlowColor}
              pulseSpeed={pulseSpeed}
              index={idx}
            />
          );
        })}
      </Svg>

      {/* Nodes layer */}
      {actualNodes.map((node) => {
        const size = getNodeSize(node.size);

        return (
          <View
            key={node.id}
            style={[
              s.nodeWrap,
              {
                left: node.x - size / 2,
                top: node.y - size / 2,
                width: size,
                height: size,
              },
            ]}
          >
            {/* Minimalist Node Box */}
            <View
              style={[
                s.nodeBox,
                {
                  width: size,
                  height: size,
                  borderColor: computedNodeBorder,
                  backgroundColor: isDark ? '#141417' : '#E4E4E7',
                },
              ]}
            >
              {node.icon}
            </View>

            {/* Label below node */}
            {node.label && (
              <Text
                style={[
                  s.nodeLabel,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
                numberOfLines={1}
              >
                {node.label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export type { CircuitNode as CircuitNodeType };
export default CircuitBoard;

const s = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: '#09090B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  nodeWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeBox: {
    borderRadius: 13,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  nodeLabel: {
    position: 'absolute',
    bottom: -19,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
    minWidth: 70,
  },
});
