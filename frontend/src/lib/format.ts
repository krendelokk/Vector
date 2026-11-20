import dayjs from 'dayjs';
import 'dayjs/locale/uk';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('uk');

export const fmtDate = (d: string | Date | null | undefined) => (d ? dayjs(d).format('DD.MM.YYYY') : '');
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '');
export const fromNow = (d: string | Date) => dayjs(d).fromNow();
export { dayjs };
