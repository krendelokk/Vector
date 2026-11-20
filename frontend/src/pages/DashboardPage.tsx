import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, List, Progress, Row, Skeleton, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, Stat } from '../components/PageHeader';
import { fmtDate, fmtDateTime } from '../lib/format';
import { ANP_STATUS, AUDIT_ACTIONS, EVENT_TYPE, ROLE_LABELS } from '../lib/labels';
import type { AnpStats, AnpStatus, EventType, Role } from '../lib/types';
import { useAuth } from '../store/auth';
import { colors } from '../theme';

interface DashboardData {
  role: Role;
  anp?: AnpStats;
  deadlines?: Array<{ id: string; title: string; deadline: string; status: AnpStatus; department: string; responsible: string; daysLeft: number; level: 'red' | 'yellow' | 'normal' }>;
  integrity?: { latest: { periodLabel: string; integrityIndex: number; respondentsCount: number } | null; previous: { integrityIndex: number } | null };
  officer?: { newMessages: number; openConsultations: number; awaitingReview: number; unpublished: number };
  admin?: { usersByRole: Array<{ role: Role; count: number }>; departments: number; inactiveUsers: number; recentAudit: Array<{ id: string; action: string; createdAt: string }> };
  upcomingEvents: Array<{ id: string; title: string; date: string; type: EventType }>;
}

const SCOPE_TEXT = {
  university: 'по всьому університету',
  department: 'по вашому підрозділу',
  personal: 'за вашими пунктами',
};

function daysText(d: number) {
  if (d < 0) return `прострочено на ${-d} дн.`;
  if (d === 0) return 'сьогодні';
  return `через ${d} дн.`;
}

export function DashboardPage() {
  const user = useAuth((s) => s.user)!;
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  });

  if (isLoading || !data) return <Skeleton active />;

  const events = (
    <Card title="Найближчі події" extra={<Link to="/calendar">Календар</Link>}>
      {data.upcomingEvents.length ? (
        <List
          size="small"
          dataSource={data.upcomingEvents}
          renderItem={(e) => (
            <List.Item extra={<span className="muted num">{fmtDate(e.date)}</span>}>
              <span>
                <span className="dot" style={{ background: EVENT_TYPE[e.type].color }} />
                {e.title}
              </span>
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Подій не заплановано" />
      )}
    </Card>
  );

  if (data.admin) {
    return (
      <>
        <PageHeader title={`Вітаємо, ${user.fullName.split(' ')[1] ?? user.fullName}`} description="Стан облікових записів і останні дії в системі." />
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <Col key={role} xs={12} md={8} xl={4}>
              <Stat label={ROLE_LABELS[role]} value={data.admin!.usersByRole.find((r) => r.role === role)?.count ?? 0} />
            </Col>
          ))}
          <Col xs={12} md={8} xl={4}>
            <Stat label="Підрозділів" value={data.admin.departments} note={data.admin.inactiveUsers ? `деактивовано облікових записів: ${data.admin.inactiveUsers}` : undefined} />
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="Останні дії" extra={<Link to="/audit-log">Журнал</Link>}>
              <List size="small" dataSource={data.admin.recentAudit} renderItem={(a) => (
                <List.Item extra={<span className="muted num">{fmtDateTime(a.createdAt)}</span>}>{AUDIT_ACTIONS[a.action] ?? a.action}</List.Item>
              )} />
            </Card>
          </Col>
          <Col xs={24} lg={10}>{events}</Col>
        </Row>
      </>
    );
  }

  const anp = data.anp!;
  const latest = data.integrity?.latest;
  const prev = data.integrity?.previous;
  const delta = latest && prev ? Math.round((latest.integrityIndex - prev.integrityIndex) * 10) / 10 : null;
  const overdue = data.deadlines?.filter((d) => d.level === 'red').length ?? 0;

  return (
    <>
      <PageHeader
        title={`Вітаємо, ${user.fullName.split(' ')[1] ?? user.fullName}`}
        description={`Виконання Антикорупційної програми ${SCOPE_TEXT[anp.scope]}.`}
      />
      <Row gutter={[16, 16]}>
        <Col xs={12} xl={6}>
          <Stat label="Виконання АНП" value={`${anp.total.completionRate}%`} note={`затверджено ${anp.total.APPROVED} з ${anp.total.total}`} />
        </Col>
        <Col xs={12} xl={6}>
          <Stat label="На перевірці" value={anp.total.SUBMITTED} note="звіти очікують рішення уповноваженого" />
        </Col>
        <Col xs={12} xl={6}>
          <Stat label="Прострочено" value={anp.total.OVERDUE} tone={anp.total.OVERDUE ? 'danger' : undefined} note={overdue ? 'потребують уваги' : 'немає'} />
        </Col>
        <Col xs={12} xl={6}>
          <Stat
            label="Integrity Index"
            value={latest ? latest.integrityIndex : 'немає даних'}
            note={latest ? `${latest.periodLabel}${delta !== null ? `, ${delta >= 0 ? '+' : ''}${delta} до попереднього` : ''}` : 'підсумки ще не опубліковано'}
            tone="accent"
          />
        </Col>

        {data.officer && (
          <Col span={24}>
            <Row gutter={[16, 16]}>
              <Col xs={12} xl={6}><Link to="/anp?status=SUBMITTED"><Stat label="Звіти до перевірки" value={data.officer.awaitingReview} /></Link></Col>
              <Col xs={12} xl={6}><Link to="/trust-box/inbox"><Stat label="Нові звернення" value={data.officer.newMessages} tone={data.officer.newMessages ? 'danger' : undefined} /></Link></Col>
              <Col xs={12} xl={6}><Link to="/trust-box?tab=consultations"><Stat label="Консультації без відповіді" value={data.officer.openConsultations} /></Link></Col>
              <Col xs={12} xl={6}><Link to="/integrity-index?tab=import"><Stat label="Неопубліковані опитування" value={data.officer.unpublished} /></Link></Col>
            </Row>
          </Col>
        )}

        <Col xs={24} lg={14}>
          <Card title="Дедлайни на найближчі 14 днів" extra={<Link to="/anp">Усі пункти</Link>}>
            {data.deadlines?.length ? (
              data.deadlines.map((d) => (
                <div className="deadline-row" key={d.id}>
                  <div>
                    <span className={`dot ${d.level}`} />
                    <Link to={`/anp?item=${d.id}`}>{d.title}</Link>
                    <div className="muted" style={{ fontSize: 12, marginLeft: 16 }}>
                      {d.department}, {d.responsible}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div className="num">{fmtDate(d.deadline)}</div>
                    <div style={{ fontSize: 12, color: d.level === 'red' ? colors.red : d.level === 'yellow' ? colors.amber : colors.muted }}>
                      {daysText(d.daysLeft)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Термінових пунктів немає" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>{events}</Col>

        {anp.scope === 'university' && anp.departments.length > 0 && (
          <Col span={24}>
            <Card title="Виконання за підрозділами">
              {anp.departments.map((d) => (
                <div key={d.departmentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(60px, 1fr) auto', gap: 16, alignItems: 'center', padding: '6px 0' }}>
                  <span>{d.name}</span>
                  <Progress percent={d.completionRate} showInfo={false} strokeColor={colors.primary} trailColor="#ece9e2" />
                  <span className="num muted" style={{ textAlign: 'right' }}>
                    {d.APPROVED}/{d.total}
                    {d.OVERDUE > 0 && <Tag color="error" style={{ marginLeft: 8, marginRight: 0 }}>{d.OVERDUE} простр.</Tag>}
                  </span>
                </div>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Відсоток виконання рахується як частка затверджених пунктів. Статуси: {Object.values(ANP_STATUS).map((s) => s.label.toLowerCase()).join(', ')}.
              </Typography.Text>
            </Card>
          </Col>
        )}
      </Row>
    </>
  );
}
