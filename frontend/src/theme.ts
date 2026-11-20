import type { ThemeConfig } from 'antd';

/** Стримана "діловодна" палітра: чорнильно-синій, теплий сірий фон, бурштин для попереджень. */
export const colors = {
  ink: '#14263d',
  primary: '#1f4f7a',
  amber: '#c98a1b',
  red: '#b42318',
  green: '#3b6d3f',
  bg: '#f5f4f0',
  border: '#e2dfd8',
  muted: '#6b6760',
  text: '#1d1b18',
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorInfo: colors.primary,
    colorSuccess: colors.green,
    colorWarning: colors.amber,
    colorError: colors.red,
    colorText: colors.text,
    colorTextSecondary: colors.muted,
    colorBorder: '#d6d2c9',
    colorBorderSecondary: colors.border,
    colorBgLayout: colors.bg,
    // Світлі фони для статусів: інакше AntD виводить їх із темних базових кольорів і текст губиться
    colorSuccessBg: '#eaf2ea',
    colorSuccessBorder: '#bcd4bd',
    colorWarningBg: '#fbf2df',
    colorWarningBorder: '#ecd49e',
    colorErrorBg: '#fbeceb',
    colorErrorBorder: '#efc3be',
    colorInfoBg: '#e9eff6',
    colorInfoBorder: '#bccde0',
    borderRadius: 4,
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    fontSize: 14,
    controlHeight: 34,
  },
  components: {
    Layout: { siderBg: colors.ink, headerBg: '#ffffff', headerHeight: 56, headerPadding: '0 24px' },
    Menu: {
      darkItemBg: colors.ink,
      darkItemSelectedBg: '#24405f',
      darkItemColor: '#c3ccd8',
      darkItemHoverColor: '#ffffff',
      itemBorderRadius: 3,
    },
    Card: { headerFontSize: 15 },
    Table: { headerBg: '#efede7', headerColor: colors.text, rowHoverBg: '#faf9f6' },
    Tag: { defaultBg: '#f0eee8' },
  },
};
