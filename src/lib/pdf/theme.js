import { StyleSheet } from '@react-pdf/renderer'

// Font strategy: use react-pdf's built-in Helvetica fallback.
//
// Background: we tried registering Barlow / Barlow Condensed via Google Fonts
// CDN and via jsDelivr, but react-pdf's font resolver is fragile around
// network-loaded TTFs and was throwing "Could not resolve font" errors at
// render time. Helvetica is built into react-pdf and always works.
//
// The PDF still uses brand colors (blue, yellow), structured sections,
// hierarchical headings, and the logo image — it reads as a professional
// branded report. The only thing missing is the Barlow type face, which
// is a polish item we can revisit later by bundling local TTF files.

// Brand palette
export const COLORS = {
  brandBlue:      '#0061AF',
  brandBlueDark:  '#004A85',
  brandYellow:    '#FFF200',
  brandYellowDark:'#E6D900',
  ink900:         '#0F172A',
  ink800:         '#1E293B',
  ink700:         '#334155',
  ink600:         '#475569',
  ink500:         '#64748B',
  ink400:         '#94A3B8',
  ink300:         '#CBD5E1',
  ink200:         '#E2E8F0',
  ink100:         '#F1F5F9',
  ink50:          '#F8FAFC',
  white:          '#FFFFFF',
  success:        '#16A34A',
  successBg:      '#DCFCE7',
  warning:        '#D97706',
  warningBg:      '#FEF3C7',
  danger:         '#DC2626',
  dangerBg:       '#FEE2E2',
}

export const SPACING = {
  pageH: 36,
  pageT: 24,
  pageB: 36,
  section: 18,
  block: 10,
}

// Font families: Helvetica (built into react-pdf, no registration needed).
// We use Helvetica-Bold for what was Barlow Condensed (headings/wordmark) so
// it still feels weighty even without the condensed face.
const FAM = {
  regular:   'Helvetica',
  condensed: 'Helvetica-Bold',
  bold:      'Helvetica-Bold',
  italic:    'Helvetica-Oblique',
}

export const styles = StyleSheet.create({
  page: {
    paddingTop: 80,
    paddingBottom: 50,
    paddingHorizontal: SPACING.pageH,
    fontFamily: FAM.regular,
    fontSize: 10.5,
    color: COLORS.ink800,
    lineHeight: 1.45,
  },

  // Page header band
  pageHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 56,
    backgroundColor: COLORS.brandBlue,
    paddingHorizontal: SPACING.pageH,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageHeaderLogo: {
    width: 32, height: 32,
    marginRight: 12,
  },
  pageHeaderText: {
    flex: 1,
    color: COLORS.white,
  },
  pageHeaderTitle: {
    fontFamily: FAM.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.white,
  },
  pageHeaderSub: {
    fontSize: 8,
    color: COLORS.white,
    opacity: 0.9,
    marginTop: 1,
  },
  pageHeaderRight: {
    color: COLORS.white,
    fontSize: 9,
    textAlign: 'right',
  },
  pageYellowStrip: {
    position: 'absolute',
    top: 56, left: 0, right: 0,
    height: 3,
    backgroundColor: COLORS.brandYellow,
  },

  // Page footer
  pageFooter: {
    position: 'absolute',
    bottom: 18,
    left: SPACING.pageH,
    right: SPACING.pageH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLORS.ink500,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.ink300,
    paddingTop: 6,
  },

  // Section heading — bold in brand blue, yellow underline
  sectionHeading: {
    fontFamily: FAM.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.brandBlue,
    marginTop: SPACING.section,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.brandYellow,
  },
  sectionHeadingFirst: {
    marginTop: 0,
  },

  subHeading: {
    fontFamily: FAM.bold,
    fontSize: 11,
    color: COLORS.ink900,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
  },

  para: {
    marginBottom: 6,
  },
  paraTight: {
    marginBottom: 3,
  },

  // Definition list
  dlGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 6,
  },
  dlCol: {
    width: '50%',
    marginBottom: 4,
    paddingRight: 8,
  },
  dlLabel: {
    fontFamily: FAM.bold,
    fontSize: 7.5,
    color: COLORS.ink500,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dlValue: {
    fontSize: 10.5,
    color: COLORS.ink900,
  },

  // Tables
  table: {
    marginTop: 4,
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: COLORS.ink300,
    borderRadius: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.ink100,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.ink300,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.ink200,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  th: {
    fontFamily: FAM.bold,
    fontSize: 8,
    color: COLORS.ink700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: 5,
  },
  td: {
    fontSize: 9.5,
    color: COLORS.ink800,
    padding: 5,
  },

  // Bullets
  bullet: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    fontFamily: FAM.bold,
    width: 10,
    color: COLORS.brandBlue,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 4,
    gap: 4,
  },
  badge: {
    fontFamily: FAM.bold,
    fontSize: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 2,
  },
  badgeNeutral: { backgroundColor: COLORS.ink100, color: COLORS.ink700 },
  badgeBlue:    { backgroundColor: COLORS.ink100, color: COLORS.brandBlue },
  badgeGreen:   { backgroundColor: COLORS.successBg, color: COLORS.success },
  badgeAmber:   { backgroundColor: COLORS.warningBg, color: COLORS.warning },
  badgeRed:     { backgroundColor: COLORS.dangerBg, color: COLORS.danger },

  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    marginHorizontal: -3,
  },
  photoCell: {
    width: '33.333%',
    paddingHorizontal: 3,
    marginBottom: 8,
  },
  photoImg: {
    width: '100%',
    height: 110,
    objectFit: 'cover',
    backgroundColor: COLORS.ink100,
    borderWidth: 0.5,
    borderColor: COLORS.ink300,
  },
  photoCaption: {
    fontSize: 7.5,
    color: COLORS.ink600,
    marginTop: 2,
  },
})

// Re-export for backwards compat (some files import FAM expecting Barlow)
export const FONTS = FAM
