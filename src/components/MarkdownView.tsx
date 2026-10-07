import React from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';

interface MarkdownViewProps {
  content: string;
}

/**
 * Tokenizes and renders inline markdown:
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Inline Code: `code`
 * - Links: [label](url)
 */
function renderInline(text: string, baseStyle: any, keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|\*[^*]+?\*|_[^_]+?_|\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(
        <Text key={`${keyPrefix}-t-${idx++}`} style={baseStyle}>
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }

    const fullMatch = match[0];
    if (
      (fullMatch.startsWith('**') && fullMatch.endsWith('**')) ||
      (fullMatch.startsWith('__') && fullMatch.endsWith('__'))
    ) {
      elements.push(
        <Text key={`${keyPrefix}-b-${idx++}`} style={[baseStyle, s.bold]}>
          {fullMatch.slice(2, -2)}
        </Text>
      );
    } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      elements.push(
        <Text key={`${keyPrefix}-c-${idx++}`} style={[baseStyle, s.code]}>
          {` ${fullMatch.slice(1, -1)} `}
        </Text>
      );
    } else if (
      (fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
      (fullMatch.startsWith('_') && fullMatch.endsWith('_'))
    ) {
      elements.push(
        <Text key={`${keyPrefix}-i-${idx++}`} style={[baseStyle, s.italic]}>
          {fullMatch.slice(1, -1)}
        </Text>
      );
    } else if (match[2] && match[3]) {
      const linkLabel = match[2];
      const linkUrl = match[3];
      elements.push(
        <Text
          key={`${keyPrefix}-l-${idx++}`}
          style={[baseStyle, s.link]}
          onPress={() => Linking.openURL(linkUrl).catch(() => {})}>
          {linkLabel}
        </Text>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(
      <Text key={`${keyPrefix}-t-${idx++}`} style={baseStyle}>
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return elements;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  if (!content || !content.trim()) {
    return (
      <Text style={s.paragraphText}>
        General performance updates and fixes.
      </Text>
    );
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      // Collapse multiple blank lines
      if (i > 0 && lines[i - 1].trim()) {
        nodes.push(<View key={`spacer-${i}`} style={s.blankSpacer} />);
      }
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      nodes.push(<View key={`hr-${i}`} style={s.hr} />);
      continue;
    }

    // Headings (# H1, ## H2, ### H3+)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      let headingStyle: TextStyle = s.h3;
      if (level === 1) headingStyle = s.h1;
      else if (level === 2) headingStyle = s.h2;

      nodes.push(
        <Text key={`h-${i}`} style={headingStyle}>
          {renderInline(headingText, headingStyle, `h-${i}`)}
        </Text>
      );
      continue;
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      nodes.push(
        <View key={`quote-${i}`} style={s.quoteBox}>
          <Text style={s.quoteText}>
            {renderInline(quoteMatch[1], s.quoteText, `quote-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Unordered List (- item, * item, • item)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      nodes.push(
        <View key={`bullet-${i}`} style={s.bulletRow}>
          <Text style={s.bulletIcon}>•</Text>
          <Text style={s.bulletText}>
            {renderInline(bulletMatch[1], s.bulletText, `b-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered List (1. item, 2. item)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      nodes.push(
        <View key={`num-${i}`} style={s.bulletRow}>
          <Text style={s.numIcon}>{numMatch[1]}.</Text>
          <Text style={s.bulletText}>
            {renderInline(numMatch[2], s.bulletText, `n-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Regular Paragraph
    nodes.push(
      <Text key={`p-${i}`} style={s.paragraphText}>
        {renderInline(trimmed, s.paragraphText, `p-${i}`)}
      </Text>
    );
  }

  return <View style={s.container}>{nodes}</View>;
}

const s = StyleSheet.create({
  container: {
    gap: 3,
  },
  blankSpacer: {
    height: 6,
  },
  hr: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 6,
  },
  h1: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  h2: {
    color: '#FF9F0A',
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  h3: {
    color: '#FF9F0A',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bulletIcon: {
    color: '#FF9F0A',
    fontSize: 12,
    lineHeight: 18,
    marginRight: 6,
  },
  numIcon: {
    color: '#FF9F0A',
    fontSize: 11,
    lineHeight: 18,
    marginRight: 6,
    fontWeight: '600',
  },
  bulletText: {
    flex: 1,
    color: '#D1D1D6',
    fontSize: 12,
    lineHeight: 18,
  },
  paragraphText: {
    color: '#D1D1D6',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 3,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
    color: '#E5E5EA',
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#FFD60A',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  link: {
    color: '#FF9F0A',
    textDecorationLine: 'underline',
  },
  quoteBox: {
    borderLeftWidth: 2,
    borderLeftColor: '#FF9F0A',
    paddingLeft: 8,
    marginVertical: 4,
  },
  quoteText: {
    color: '#8E8E93',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
});
