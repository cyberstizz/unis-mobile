// src/screens/HelpScreen.tsx
// ─────────────────────────────────────────────────────────────
// Help center — mobile port of web src/HelpPage.jsx.
// Topic accordion → question accordion, search across titles AND article
// text, deep links: navigate('Help', { section: 'voting' }) opens a topic,
// { section: 'voting-points' } opens the topic and that one answer.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { HELP_SECTIONS } from '../data/helpContent';
import { useUnisTheme } from '../theme/unisTheme';
import { SUPPORT_EMAIL, webUrl } from '../config/links';

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
    <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M8 10l4 4 4-4" stroke="rgba(255,255,255,0.7)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </View>
);

// Strip JSX down to searchable text so the filter matches article bodies too.
const toText = (node: any): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join(' ');
  if (React.isValidElement(node)) return toText((node.props as any)?.children);
  return '';
};

const HelpScreen: React.FC = () => {
  const route = useRoute<any>();
  const t = useUnisTheme();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  const published = useMemo(() => HELP_SECTIONS.filter((s) => s.status === 'published' && s.articles.length > 0), []);
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return published;
    return published
      .map((s) => ({ ...s, articles: s.articles.filter((a) => a.q.toLowerCase().includes(q) || toText(a.a).toLowerCase().includes(q)) }))
      .filter((s) => s.articles.length > 0 || s.title.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q));
  }, [q, published]);

  // Deep links (web's /help#section or /help#article).
  const target = route.params?.section as string | undefined;
  useEffect(() => {
    if (!target) return undefined;
    const bySection = published.find((s) => s.id === target);
    let sectionId: string | undefined;
    if (bySection) {
      sectionId = target;
      setOpenSection(target);
      setOpenArticle(null);
    } else {
      const owner = published.find((s) => s.articles.some((a) => a.id === target));
      if (!owner) return undefined;
      sectionId = owner.id;
      setOpenSection(owner.id);
      setOpenArticle(target);
    }
    setQuery('');
    const timer = setTimeout(() => {
      const y = sectionId ? offsets.current[sectionId] : undefined;
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [target, published]);

  const toggleSection = useCallback((id: string) => {
    setOpenSection((cur) => (cur === id ? null : id));
    setOpenArticle(null);
  }, []);
  const toggleArticle = useCallback((id: string) => setOpenArticle((cur) => (cur === id ? null : id)), []);

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: t.textAccent }]}>Help center</Text>
      <Text style={styles.title} accessibilityRole="header">How Unis works</Text>
      <Text style={styles.sub}>Every rule that decides a vote, a win, or a payout — written out in plain language.</Text>

      <View style={[styles.search, { borderColor: t.border }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={11} cy={11} r={6.4} stroke="rgba(255,255,255,0.55)" strokeWidth={2} fill="none" />
          <Path d="M16 16l4 4" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search help"
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.searchInput}
          accessibilityLabel="Search help"
          returnKeyType="search"
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
            <Text style={styles.clear}>×</Text>
          </Pressable>
        )}
      </View>

      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing matches “{query}”.</Text>
          <Pressable style={styles.emptyBtn} onPress={() => setQuery('')}><Text style={styles.emptyBtnText}>Show all topics</Text></Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {results.map((section) => {
            const isOpen = openSection === section.id || Boolean(q);
            return (
              <View
                key={section.id}
                style={[styles.topic, isOpen && { borderColor: t.border, backgroundColor: t.subtle }]}
                onLayout={(e) => { offsets.current[section.id] = e.nativeEvent.layout.y; }}
              >
                <Pressable style={styles.topicHead} onPress={() => toggleSection(section.id)} accessibilityState={{ expanded: isOpen }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topicTitle}>{section.title}</Text>
                    <Text style={styles.topicBlurb}>{section.blurb}</Text>
                  </View>
                  <Text style={[styles.count, { backgroundColor: t.soft, color: t.textAccent }]}>{section.articles.length}</Text>
                  <Chevron open={isOpen} />
                </Pressable>
                {isOpen && (
                  <View style={styles.panel}>
                    {section.articles.map((article) => {
                      const aOpen = openArticle === article.id;
                      return (
                        <View key={article.id} style={styles.qa}>
                          <Pressable style={styles.qaQ} onPress={() => toggleArticle(article.id)} accessibilityState={{ expanded: aOpen }}>
                            <Text style={[styles.qaQText, aOpen && { color: '#fff' }]}>{article.q}</Text>
                            <Chevron open={aOpen} />
                          </Pressable>
                          {aOpen && <View style={styles.qaA}>{article.a}</View>}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.foot}>
        <Text style={styles.footText}>
          Still stuck? Reach us at{' '}
          <Text style={[styles.link, { color: t.textAccent }]} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</Text>
          {' '}and we will get back to you.
        </Text>
        <View style={styles.footLinks}>
          {[
            ['Terms', '/terms'],
            ['Privacy', '/privacy'],
            ['Cookies', '/cookie'],
            ['Report infringement', '/report'],
          ].map(([label, path]) => (
            <Text key={path} style={styles.footLink} onPress={() => Linking.openURL(webUrl(path))}>{label}</Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  sub: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 21, marginTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 18, paddingHorizontal: 14, height: 48, borderRadius: 24, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 15.5 },
  clear: { color: 'rgba(255,255,255,0.7)', fontSize: 24, lineHeight: 26 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  topic: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden' },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  topicTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  topicBlurb: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, marginTop: 3 },
  count: { minWidth: 26, textAlign: 'center', fontSize: 12, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  panel: { paddingHorizontal: 12, paddingBottom: 10 },
  qa: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  qaQ: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 4 },
  qaQText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: '700' },
  qaA: { paddingHorizontal: 4, paddingBottom: 6 },
  foot: { marginTop: 28, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', gap: 12 },
  footText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20 },
  link: { fontWeight: '700' },
  footLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  footLink: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});

export default HelpScreen;
