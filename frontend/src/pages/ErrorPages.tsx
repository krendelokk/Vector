import { Button, Result } from 'antd';
import { Link } from 'react-router-dom';

export const ForbiddenPage = () => (
  <Result status="403" title="Немає доступу" subTitle="Ця сторінка недоступна для вашої ролі."
    extra={<Link to="/dashboard"><Button type="primary">На головну</Button></Link>} />
);

export const NotFoundPage = () => (
  <Result status="404" title="Сторінку не знайдено" extra={<Link to="/dashboard"><Button type="primary">На головну</Button></Link>} />
);
