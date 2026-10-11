import React from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/icons/Icon';
import AppText from '../components/AppText';
import { COLORS, RADIUS } from '../theme/fao';

const ATIO_INITIATIVE_URL = 'https://www.fao.org/agrifood-systems-technologies-innovations-outlook/en';
const ATIO_EMAIL = 'ATIO@fao.org';

/** Static copy from the portal's "About ATIO Knowledge Base" page. */
const FEATURES = [
  {
    title: 'Broad scope single entry point',
    body: 'Filling a systemic information gap and developing a single-entry-point information system that monitors information on all types of innovations (technological, social, institutional, policy, and financial) through their entire life cycle, for the whole agrifood value chain, across the full spectrum of stakeholders, with global coverage and focus on low- and middle-income countries.',
  },
  {
    title: 'Bringing formal and informal processes together',
    body: 'Systematically documenting and giving visibility to grassroots-driven innovations to broaden the basis for decision making and show and promote synergies between formal and grassroots innovation processes.',
  },
  {
    title: 'Currency and timeliness',
    body: 'While the ATIO publication is biennial and provides selected insights, there is a need for a regularly updated, continuously available catalog that different AFS actors can consult at any time to derive their own insights and make better decisions towards more appropriate solutions.',
  },
  {
    title: 'Insight-enabling information',
    body: 'Drawing insights from such a catalog requires descriptions and annotations that holistically document the relevant dimensions of technology and innovation generation and uptake, like readiness, adoption potential, use, development modalities etc.',
  },
  {
    title: 'Partnership-based',
    body: 'Content is federated from multiple sources, ensuring a diverse and rich knowledge base that supports informed decision-making.',
  },
];

/**
 * About ATIO Knowledge Base, opened from Settings.
 *
 * Rendered in place of the Settings content rather than as a modal, so the tab
 * bar and the alpha disclaimer above it stay in view.
 *
 * @param {() => void} onBack
 */
export default function AboutScreen({ onBack }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
        >
          <Icon name="arrow-back" size={22} color={COLORS.textHeading} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle} accessibilityRole="header">About</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText style={styles.title} accessibilityRole="header">About ATIO Knowledge Base</AppText>
        <AppText style={styles.body}>
          The Agrifood Systems Technologies and Innovations Outlook (ATIO) Knowledge Base (KB) is a
          comprehensive, open-access platform designed to support policymakers, investors,
          researchers, innovation users, and innovators in making informed decisions to accelerate
          the transformation of agrifood systems. Powered by AI and enriched through partnerships,
          including grassroots organizations, the ATIO KB bridges grassroots innovations with
          mainstream innovations.
        </AppText>
        <AppText style={styles.body}>
          The ATIO KB is an integral part of the broader ATIO initiative at FAO, aimed at enhancing
          the uptake of Science, Technology, and Innovation (STI) in agrifood systems. To get to
          know more about the ATIO initiative, visit the{' '}
          <AppText
            style={styles.link}
            onPress={() => Linking.openURL(ATIO_INITIATIVE_URL)}
            accessibilityRole="link"
          >
            ATIO Initiative website
          </AppText>
          .
        </AppText>

        <AppText style={styles.sectionTitle} accessibilityRole="header">Our Mission</AppText>
        <AppText style={styles.body}>
          The ATIO KB aims to overcome the limited application of STI in LMICs due to issues like
          technology appropriateness, accessibility, and capacities. ATIO seeks to help policy
          makers, investors, researchers, innovation users, and innovators make better decisions and
          promote solutions that are context-specific, profitable, and sustainable, thereby
          contributing to sustainable transformation of agrifood systems for all.
        </AppText>

        <AppText style={styles.sectionTitle} accessibilityRole="header">Key Features</AppText>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.feature}>
            <AppText style={styles.featureTitle}>{f.title}</AppText>
            <AppText style={styles.featureBody}>{f.body}</AppText>
          </View>
        ))}

        <View style={styles.callout}>
          <AppText style={styles.calloutEyebrow}>LAUNCH AT SIF 2025</AppText>
          <AppText style={styles.body}>
            The ATIO 2025 report and the ATIO KB were launched at the Science and Innovation Forum
            (SIF) during the week of October 13–17, 2025. This event explored key themes such as
            global R&D trends, mission-oriented innovation systems, and the future technology
            frontier for sustainable agriculture.
          </AppText>
          <AppText style={[styles.body, styles.lastBody]}>
            During the week, we had a live demo to show how to use the ATIO Knowledge Base (KB).
            This session aimed to showcase the functionalities of the KB and guide participants on
            how to navigate and extract the most value from the platform.
          </AppText>
        </View>

        <View style={[styles.callout, styles.partnerCallout]}>
          <AppText style={styles.calloutEyebrow}>BECOME A PARTNER</AppText>
          <AppText style={styles.body}>
            Become a part of our dynamic community by joining the ATIO Knowledge Base (ATIO KB). As
            a partner you'll gain the opportunity to contribute to the knowledge base, and the
            chance to collaborate with other experts in the field. Partnership is open to any
            organization working on agrifood systems technologies and innovations.
          </AppText>
          <AppText style={[styles.body, styles.lastBody]}>
            Inquire about our Multi-Stakeholder Partnership model by writing to{' '}
            <AppText
              style={styles.link}
              onPress={() => Linking.openURL(`mailto:${ATIO_EMAIL}`)}
              accessibilityRole="link"
            >
              {ATIO_EMAIL}
            </AppText>
            .
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textHeading },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textHeading, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textHeading, marginTop: 12, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 22, color: COLORS.textBody, marginBottom: 12 },
  lastBody: { marginBottom: 0 },
  link: { color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
  feature: { borderLeftWidth: 3, borderLeftColor: COLORS.primary, paddingLeft: 12, marginBottom: 14 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textHeading, marginBottom: 4 },
  featureBody: { fontSize: 13, lineHeight: 20, color: COLORS.textBody },
  callout: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: 16, marginTop: 12 },
  partnerCallout: { backgroundColor: COLORS.accentTint },
  calloutEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: COLORS.primaryDark, marginBottom: 8 },
});
