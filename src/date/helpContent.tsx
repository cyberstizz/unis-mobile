// src/data/helpContent.tsx
// ════════════════════════════════════════════════════════════════════════════
// HELP CENTER CONTENT — mobile copy of web src/data/helpContent.jsx.
//
// The article text (HELP_SECTIONS below) is the web file's, converted tag for
// tag: <p> → <P>, <p className="help-note"> → <P note>, <b> → <B>, <em> → <Em>,
// <ul>/<li> → <Ul>/<Li>, <a> → <A>. The tables (interval ladder, jurisdiction
// ladder, message lanes, tiebreaker cascade, prize table, point table, level
// ladder, waitlist tiers, fee examples, revenue split) are native versions of
// the web components. Shared figures live in ./helpFigures.ts.
//
// Rules carried over from web:
//   1. Nothing here describes intended behaviour. Every sentence must be true
//      of the code that is actually deployed.
//   2. Numbers that appear in more than one place live in helpFigures.ts.
//   3. Write from the listener's side of the screen.
// When the web file changes, re-run the same conversion for the sections.
// ════════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MIN_SONG_PRICE_CENTS, artistReceivesCents, formatCents } from '../utils/platformFee';
import { webUrl } from '../config/links';
import { useUnisTheme } from '../theme/unisTheme';
import {
  VOTE_POINTS,
  MESSAGE_REQUEST_DAILY_LIMIT,
  COMMENTS_PER_TRACK,
  COMMENT_MAX_LENGTH,
  INTERVAL_WEIGHTS,
  POINT_ACTIONS,
  LEVELS,
  WAITLIST_TIERS,
  COMMUNITY_SPLIT,
} from './helpFigures';

export {
  VOTE_POINTS,
  ENGAGEMENT_WEIGHTS,
  MESSAGE_REQUEST_DAILY_LIMIT,
  COMMENTS_PER_TRACK,
  COMMENT_MAX_LENGTH,
  INTERVAL_WEIGHTS,
  POINT_ACTIONS,
  LEVELS,
  WAITLIST_TIERS,
  COMMUNITY_SPLIT,
} from './helpFigures';

// ── Text primitives ────────────────────────────────────────────────────────
const P: React.FC<{ note?: boolean; children?: React.ReactNode }> = ({ note, children }) =>
  note ? (
    <View style={s.note}><Text style={s.noteText}>{children}</Text></View>
  ) : (
    <Text style={s.p}>{children}</Text>
  );
const B: React.FC<{ children?: React.ReactNode }> = ({ children }) => <Text style={s.b}>{children}</Text>;
const Em: React.FC<{ children?: React.ReactNode }> = ({ children }) => <Text style={s.em}>{children}</Text>;
const A: React.FC<{ href: string; children?: React.ReactNode }> = ({ href, children }) => {
  const t = useUnisTheme();
  return (
    <Text style={[s.a, { color: t.textAccent }]} onPress={() => Linking.openURL(/^https?:|^mailto:/.test(href) ? href : webUrl(href))}>
      {children}
    </Text>
  );
};
const Ul: React.FC<{ children?: React.ReactNode }> = ({ children }) => <View style={s.ul}>{children}</View>;
const Li: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <View style={s.li}>
    <Text style={s.bullet}>•</Text>
    <Text style={s.liText}>{children}</Text>
  </View>
);

// ── Tables ─────────────────────────────────────────────────────────────────
const Bar: React.FC<{ pct: number; label: string }> = ({ pct, label }) => {
  const t = useUnisTheme();
  return (
    <View style={s.barCell}>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(4, pct)}%`, backgroundColor: t.primary }]} />
      </View>
      <Text style={s.barLabel}>{label}</Text>
    </View>
  );
};

const Table: React.FC<{ head: string[]; rows: React.ReactNode[][]; label: string }> = ({ head, rows, label }) => (
  <View style={s.table} accessibilityLabel={label}>
    <View style={[s.tr, s.thead]}>
      {head.map((h, i) => <Text key={h} style={[s.th, i === 1 && { flex: 1.6 }]}>{h}</Text>)}
    </View>
    {rows.map((cells, r) => (
      <View key={r} style={[s.tr, r > 0 && s.trDivider]}>
        {cells.map((c, i) => (
          typeof c === 'string' || typeof c === 'number'
            ? <Text key={i} style={[s.td, i === 0 && s.tdName, i === 1 && { flex: 1.6 }]}>{c}</Text>
            : <View key={i} style={[s.tdView, i === 1 && { flex: 1.6 }]}>{c}</View>
        ))}
      </View>
    ))}
  </View>
);

const IntervalLadder = () => {
  const max = Math.max(...INTERVAL_WEIGHTS.map((i) => i.weight));
  return (
    <Table
      label="Vote weight by interval"
      head={['Interval', 'You can vote', 'Weight']}
      rows={INTERVAL_WEIGHTS.map((i) => [i.label, i.cadence, <Bar key="b" pct={(i.weight / max) * 100} label={String(i.weight)} />])}
    />
  );
};

const JurisdictionLadder = () => {
  const t = useUnisTheme();
  const rows = [
    { tier: 'Unis', note: 'Everyone can vote here', kind: 'site' },
    { tier: 'State', note: 'If your home is inside it', kind: '' },
    { tier: 'City / metro', note: 'If your home is inside it', kind: '' },
    { tier: 'Your neighborhood', note: 'Your home jurisdiction', kind: 'home' },
  ];
  return (
    <View style={s.juris}>
      {rows.map((r, i) => (
        <View
          key={r.tier}
          style={[
            s.jurisRow,
            { marginLeft: i * 12 },
            r.kind === 'site' && { borderColor: t.border, backgroundColor: t.subtle },
            r.kind === 'home' && { borderColor: t.primary },
          ]}
        >
          <Text style={s.jurisTier}>{r.tier}</Text>
          <Text style={s.jurisNote}>{r.note}</Text>
        </View>
      ))}
    </View>
  );
};

const LANE_ROWS = [
  { who: 'People you follow', lane: 'inbox', note: 'Straight to your messages' },
  { who: 'People who support you', lane: 'inbox', note: 'If you left that switch on' },
  { who: 'Anyone you messaged first', lane: 'inbox', note: 'Always, from then on' },
  { who: 'Everyone else', lane: 'requests', note: 'One message, waiting for you' },
  { who: 'People you blocked', lane: 'none', note: 'Cannot reach you at all' },
];

const MessageLanes = () => (
  <Table
    label="Where a message lands"
    head={['Who is writing', 'Where it lands']}
    rows={LANE_ROWS.map((r) => [
      r.who,
      <View key="w">
        <Text style={[s.td, { fontWeight: '800', color: r.lane === 'inbox' ? '#86efac' : r.lane === 'requests' ? '#fcd34d' : '#fca5a5' }]}>
          {r.lane === 'inbox' ? 'Your inbox' : r.lane === 'requests' ? 'Requests' : 'Nowhere'}
        </Text>
        <Text style={[s.td, { color: 'rgba(255,255,255,0.55)' }]}>{r.note}</Text>
      </View>,
    ])}
  />
);

const CASCADE = [
  { n: 1, title: 'Total points', body: 'Vote points plus engagement points, added together. This is the number an award is decided on.' },
  { n: 2, title: 'Vote points', body: 'If two nominees finish level on total, the one who earned more of it from votes takes the award.' },
  { n: 3, title: 'Plays', body: 'How many times the song was played during the period. For an artist, every play across all of their songs.' },
  { n: 4, title: 'Likes', body: 'Likes received during the period.' },
  { n: 5, title: 'Score', body: 'Lifetime points on Unis — the number that sets your level.' },
  { n: 6, title: 'Seniority', body: 'Whoever has been on Unis longest wins. This step can never tie, so every award always has exactly one winner.' },
];

const TiebreakerCascade = () => {
  const t = useUnisTheme();
  return (
    <View style={s.cascade}>
      {CASCADE.map((c) => (
        <View key={c.n} style={s.cascadeStep}>
          <View style={[s.cascadeN, { backgroundColor: t.soft, borderColor: t.border }]}><Text style={[s.cascadeNText, { color: t.textAccent }]}>{c.n}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.b}>{c.title}</Text>
            <Text style={s.liText}>{c.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const PrizeTable = () => (
  <Table
    label="Award periods and prizes"
    head={['Award', 'Period', 'Points']}
    rows={INTERVAL_WEIGHTS.map((i) => [i.label, i.window, `+${i.prize.toLocaleString()}`])}
  />
);

const PointTable = () => (
  <Table
    label="What earns points"
    head={['You', 'Action', 'Points']}
    rows={POINT_ACTIONS.map((a) => [a.you, a.label, a.they])}
  />
);

const LevelLadder = () => (
  <Table
    label="Levels and their thresholds"
    head={['Level', 'Who is here', 'Points']}
    rows={LEVELS.map((l, i) => {
      const next = LEVELS[i + 1];
      return [l.label, l.note, next ? `${l.from}–${next.from - 1}` : `${l.from.toLocaleString()}+`];
    })}
  />
);

const WaitlistTiers = () => {
  const max = Math.max(...WAITLIST_TIERS.map((w) => w.threshold));
  return (
    <Table
      label="Signups needed to unlock a region"
      head={['Region', 'Examples', 'Needed']}
      rows={WAITLIST_TIERS.map((w) => [w.label, w.note, <Bar key="b" pct={(w.threshold / max) * 100} label={w.threshold.toLocaleString()} />])}
    />
  );
};

const FEE_EXAMPLE_CENTS = [MIN_SONG_PRICE_CENTS, 100, 199, 500, 1000];

const FeeExamples = () => (
  <Ul>
    {FEE_EXAMPLE_CENTS.map((c) => (
      <Li key={c}>
        {formatCents(c)} paid → the artist gets <B>{formatCents(artistReceivesCents(c))}</B>
      </Li>
    ))}
  </Ul>
);

const RevenueSplit = () => (
  <Table
    label="How each listener's share is divided"
    head={['Goes to', 'Who that is', 'Share']}
    rows={COMMUNITY_SPLIT.map((x) => [x.label, x.note, <Bar key="b" pct={x.pct} label={`${x.pct}%`} />])}
  />
);

export interface HelpArticle { id: string; q: string; a: React.ReactNode }
export interface HelpSection { id: string; title: string; blurb: string; status: string; articles: HelpArticle[] }

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'voting',
    title: 'Voting',
    blurb: 'How votes work, where you can cast them, and what each one counts for.',
    status: 'published',
    articles: [
      {
        id: 'voting-basics',
        q: 'How often can I vote?',
        a: (
          <>
            <P>
              Once per interval, in each place you can vote, for each category.
              A category is a genre paired with what you are voting for — a song
              or an artist.
            </P>
            <P>
              The six intervals run on their own clocks. Voting in the daily
              race does not use up your weekly vote, and voting for a rap song
              does not use up your vote for a rap artist.
            </P>
            <IntervalLadder />
            <P note>
              Longer intervals carry more weight when a winner is decided. An
              annual vote counts for 250 toward that year&rsquo;s award; a daily
              vote counts for 10 toward that day&rsquo;s.
            </P>
          </>
        ),
      },
      {
        id: 'voting-where',
        q: 'Where can I vote?',
        a: (
          <>
            <P>
              In your home jurisdiction, and in every jurisdiction that contains
              it — your city, your state, and Unis itself. You cannot vote in a
              neighborhood you are not part of.
            </P>
            <JurisdictionLadder />
            <P>
              Unis is the sitewide jurisdiction and sits above everything, so it
              is always open to you. If a local race is closed or has no
              nominees, you can always back an artist at the Unis level instead.
            </P>
            <P note>
              Your home jurisdiction is set from your location when you create
              your account. Some jurisdictions do not have voting turned on
              yet — those will not appear as an option.
            </P>
          </>
        ),
      },
      {
        id: 'voting-final',
        q: 'Can I change or take back a vote?',
        a: (
          <>
            <P>
              No. A vote is final for the interval you cast it in. Once you back
              a song for the day, the daily slot for that genre in that
              jurisdiction is spent — you cannot switch to a different song, and
              you cannot undo it.
            </P>
            <P>
              This is deliberate. If votes could be moved, a race could be
              swung in the last minute by people watching the standings, and
              the leaderboard would stop meaning anything until the moment it
              closed.
            </P>
          </>
        ),
      },
      {
        id: 'voting-points',
        q: 'Do I earn points for voting?',
        a: (
          <>
            <P>
              Yes. Casting a vote adds <B>{VOTE_POINTS} points</B> to your
              score. The artist or song you back gains points too, which is
              separate from the vote itself and counts toward their standing.
            </P>
            <P>
              Points are not the same thing as votes. Points build your own
              level on Unis over time; votes decide who wins an award. A vote
              does both at once.
            </P>
          </>
        ),
      },
      {
        id: 'voting-requirements',
        q: 'Why is my vote being refused?',
        a: (
          <>
            <P>There are five reasons a vote will not go through:</P>
            <Ul>
              <Li>
                <B>Your phone is not verified.</B> Voting requires a verified
                phone number. You can add one in Settings.
              </Li>
              <Li>
                <B>You already voted in this category.</B> One vote per
                interval, per genre, per song-or-artist, per jurisdiction.
              </Li>
              <Li>
                <B>You are not part of that jurisdiction.</B> You can only vote
                in your home jurisdiction and the ones above it.
              </Li>
              <Li>
                <B>Voting is not enabled there yet.</B> Some jurisdictions are
                still opening up.
              </Li>
              <Li>
                <B>You are browsing as a guest.</B> Sign in to vote.
              </Li>
            </Ul>
            <P note>
              Every refusal tells you which of these it was. If a vote fails
              with anything else, it was not counted and you can try again.
            </P>
          </>
        ),
      },
      {
        id: 'voting-day',
        q: 'When does the day roll over?',
        a: (
          <>
            <P>
              Midnight Eastern time, everywhere. Unis stamps every vote in New
              York time regardless of where you are, so the daily race opens and
              closes at the same instant for every listener.
            </P>
            <P>
              If you are on the west coast, that means the day rolls over at
              9:00 PM your time. If you are outside the US, it rolls over on
              your clock at whatever 12:00 AM in New York works out to.
            </P>
          </>
        ),
      },
    ],
  },

  // ── Awaiting audit ────────────────────────────────────────────────────────
  // Each of these becomes `status: 'published'` with real articles once its
  // system has been walked end to end.
  {
    id: 'awards',
    title: 'Awards',
    blurb: 'How a winner is decided, when results post, and what winning is worth.',
    status: 'published',
    articles: [
      {
        id: 'awards-what',
        q: 'What counts as one award?',
        a: (
          <>
            <P>
              An award is one genre, one kind of nominee, one jurisdiction, one
              period. <B>Rap Song of the Day in Harlem</B> is a different award
              from Rap Artist of the Day in Harlem, from Rock Song of the Day in
              Harlem, and from Rap Song of the Day in New York.
            </P>
            <P>
              Every one of those has exactly one winner. Not a top three, not a
              tie — one.
            </P>
          </>
        ),
      },
      {
        id: 'awards-winner',
        q: 'How is the winner decided?',
        a: (
          <>
            <P>
              On points. Everything you do in a period earns them, and the
              nominee with the most at the close takes the award.
            </P>
            <P>
              A vote is worth between 10 and 250 points depending on which
              award it was cast for. A play is worth 1. A like is worth 5. Those
              are added together — votes are not checked first and engagement
              second, it is one number.
            </P>
            <P>
              So a vote still counts for far more than a play, by a wide margin.
              But an artist a neighborhood is genuinely listening to can win
              without a single vote being cast, and that is deliberate. Nobody
              opening the voting wizard on a given day should not hand the award
              to whoever talked one friend into a tap.
            </P>
            <TiebreakerCascade />
            <P note>
              Every award records which step decided it, and whether votes or
              engagement made up the larger half of the winning total. That is
              part of the permanent record of the win.
            </P>
          </>
        ),
      },
      {
        id: 'awards-weight',
        q: 'Why is one vote worth more than another?',
        a: (
          <>
            <P>
              Because of what it costs you. A daily vote is one of many you will
              cast this year. An annual vote is the only one you get — so it
              carries far more weight when a winner is decided.
            </P>
            <IntervalLadder />
            <P>
              Every vote cast during a period counts toward that period&rsquo;s
              award, at the weight of the interval it was cast for. So a single
              annual vote is worth 25 daily votes, and an artist who wins one
              committed supporter has gained more than one who picked up a
              handful of casual taps.
            </P>
          </>
        ),
      },
      {
        id: 'awards-where',
        q: 'Can an artist win in more than one place?',
        a: (
          <>
            <P>
              Yes — upward. An artist based in a neighborhood competes for that
              neighborhood&rsquo;s award, and for the award of every jurisdiction
              above it, all the way to Unis.
            </P>
            <P>
              It does not work sideways or downward. An artist can only win in
              their own jurisdiction and the ones that contain it, so a Harlem
              artist is never in the running for a Brooklyn award.
            </P>
            <P note>
              This is why local wins matter. A neighborhood award is a much
              smaller field than a sitewide one, and it is the field you are
              actually from.
            </P>
          </>
        ),
      },
      {
        id: 'awards-when',
        q: 'When are winners announced?',
        a: (
          <>
            <P>
              At <B>12:01 AM Eastern</B>, one minute after the period closes.
              Daily awards post every night, weekly awards early Monday, monthly
              awards on the 1st, and so on.
            </P>
            <PrizeTable />
            <P>
              A period is only settled once it has fully elapsed. While a period
              is still running you can watch the standings, but nothing is final
              and the leader can change until the moment it closes.
            </P>
          </>
        ),
      },
      {
        id: 'awards-noone',
        q: 'What if nobody voted?',
        a: (
          <>
            <P>
              Nothing special happens — the award is decided the same way it
              always is. With no votes cast, every nominee&rsquo;s total is
              simply their engagement points, and whoever was played and liked
              most that period wins it outright.
            </P>
            <P>
              If a category saw no votes, no plays and no likes at all, someone
              is still crowned: the nominee with the highest lifetime score,
              then the longest-standing account. A new jurisdiction gets a real
              winner from its first day instead of an empty page.
            </P>
          </>
        ),
      },
      {
        id: 'awards-worth',
        q: 'What does winning get me?',
        a: (
          <>
            <P>
              Points, permanently. An award adds to your score the moment it is
              decided — <B>50</B> for a daily win up to <B>5,000</B> for an
              annual one. Those points count toward your level like any others,
              and they never expire.
            </P>
            <P>
              The win itself is permanent too. It goes on your profile and into
              your jurisdiction&rsquo;s record of past winners, and it stays
              there.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'ranking',
    title: 'Rankings',
    blurb: 'What your rank means and how often it moves.',
    status: 'published',
    articles: [
      {
        id: 'ranking-what',
        q: 'What is my rank?',
        a: (
          <>
            <P>
              Where you stand against every other artist in your jurisdiction
              right now, for a given period. It is worked out the same way an
              award winner is — weighted votes first, then plays, likes, score,
              and seniority — so your rank is a live preview of who would win if
              the period closed today.
            </P>
            <P>
              You get two ranks in each place: one against every artist there,
              and one against only the artists in your genre.
            </P>
          </>
        ),
      },
      {
        id: 'ranking-when',
        q: 'How often does my rank update?',
        a: (
          <>
            <P>
              Once a night. Unis recalculates every rank after midnight Eastern
              and swaps the new standings in all at once, so you never catch the
              board mid-calculation.
            </P>
            <P>
              Each rank is measured against the last <B>complete</B> day. That
              is why today&rsquo;s activity does not move your rank until
              tomorrow — a half-finished day would make the number jump around
              for reasons nobody could act on.
            </P>
          </>
        ),
      },
      {
        id: 'ranking-periods',
        q: 'Why do I have more than one rank?',
        a: (
          <>
            <P>
              Because different periods tell you different things. Unis keeps a
              rank for the day, the week, the month, the quarter, the year, and
              for all time.
            </P>
            <P>
              A strong week and a weak year usually means you are climbing. The
              reverse usually means an older release is carrying you. Both are
              worth knowing, so neither one is hidden.
            </P>
          </>
        ),
      },
      {
        id: 'ranking-vs-award',
        q: 'Is my rank the same as an award?',
        a: (
          <>
            <P>
              No. A rank is where you stand while a period is still running. An
              award is what gets recorded when it closes. Ranks move every
              night; awards are permanent.
            </P>
            <P>
              Being ranked first for the week does not guarantee the weekly
              award. Nothing is settled until the period ends.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'points',
    title: 'Points and levels',
    blurb: 'What earns points, what levels mean, and why your score only goes up.',
    status: 'published',
    articles: [
      {
        id: 'points-what',
        q: 'What are points?',
        a: (
          <>
            <P>
              Your record of showing up. Every meaningful thing you do on
              Unis — playing, liking, voting, referring, curating — adds to a
              single running score, and that score sets your level.
            </P>
            <P>
              Artists and listeners share the same scale. An artist just has
              more ways onto it: their tracks earn on every play, like, and vote
              they receive, on top of whatever they earn listening themselves.
            </P>
          </>
        ),
      },
      {
        id: 'points-earn',
        q: 'What earns points?',
        a: (
          <>
            <P>
              Most of it is what you were doing anyway. The left column is what
              you earn; the right is what the track and its artist earn from the
              same action.
            </P>
            <PointTable />
            <P note>
              A play or a like pays you and the artist at the same time. You are
              never choosing between building your own score and backing
              somebody else&rsquo;s — one action does both.
            </P>
          </>
        ),
      },
      {
        id: 'points-levels',
        q: 'What are levels for?',
        a: (
          <>
            <P>
              Four bands, set by your score, shown on your profile.
            </P>
            <LevelLadder />
            <P>
              Levels are how Unis will decide access to live events and
              giveaways as those roll out. They are also the plainest signal of
              who has actually been here — a Diamond listener has put in a lot
              of listening, and that is visible to everyone.
            </P>
          </>
        ),
      },
      {
        id: 'points-down',
        q: 'Can my score go down?',
        a: (
          <>
            <P>
              Only in two cases. Deleting a playlist you made takes back the
              points the playlist itself earned you — the 5 for starting a
              community playlist, and the 10 if it reached 10 followers. Unis
              shows you the amount before you confirm.
            </P>
            <P>
              And if someone you referred, or someone who picked you to
              support, deletes their account within 30 days of joining, the
              points their sign-up gave you come off. Otherwise joining and
              deleting over and over would pay without limit.
            </P>
            <P>
              Either can lower your level if it takes you below that
              level&rsquo;s threshold.
            </P>
            <P>
              Nothing else lowers your score. Unfollowing, unliking, switching
              the artist you support, or people unfollowing your playlist —
              none of it takes anything back.
            </P>
            <P>
              Points record what you did, not what you currently have. Something
              you did last year still happened, so the score keeps it.
            </P>
          </>
        ),
      },
      {
        id: 'points-vs-votes',
        q: 'Are points the same as votes?',
        a: (
          <>
            <P>
              No, and this is the one thing worth getting straight. <B>Votes
              decide who wins awards. Points decide your level.</B> They are
              separate systems that happen to touch at one point: casting a vote
              earns you points, the same way a play does.
            </P>
            <P>
              So a listener with a huge score has no more say in an award than
              anyone else — one vote each, whoever you are. Score buys standing,
              not influence.
            </P>
            <P note>
              The one exception is a tie. If two nominees are dead level on
              votes, plays, and likes, score is the next tiebreaker — but only
              after all three of those have failed to separate them.
            </P>
          </>
        ),
      },
      {
        id: 'points-limits',
        q: 'Can I just play the same song all day?',
        a: (
          <>
            <P>
              It will not do anything after the first play. The 30-minute rule
              in Play counts means the same track only pays once per half hour,
              for you and for the artist.
            </P>
            <P>
              Listening widely is what accumulates. That is the whole point of
              the limit — a score should mean somebody was actually here, not
              that a tab was left open overnight.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'plays',
    title: 'Play counts',
    blurb: 'What counts as a play and why the same song stops counting.',
    status: 'published',
    articles: [
      {
        id: 'plays-what',
        q: 'What happens when I play a song?',
        a: (
          <>
            <P>
              Three things at once. You earn a point, the song earns a point,
              and the artist earns a point. One play, three ledgers.
            </P>
            <P>
              This is why listening is not a passive act on Unis. Every play you
              choose is a small amount of standing you are handing to an artist,
              and a small amount you are building for yourself.
            </P>
          </>
        ),
      },
      {
        id: 'plays-repeat',
        q: 'Why did playing that song again not count?',
        a: (
          <>
            <P>
              The same song only counts once every <B>30 minutes</B> for the
              same listener. Play it on repeat and the second play through does
              nothing — no point for you, none for the song, none for the
              artist.
            </P>
            <P>
              There is no limit on how many <Em>different</Em> songs you play.
              Listening widely keeps earning; looping one track does not. That
              is the point of the rule — a play should mean somebody chose to
              listen, not that a tab was left open.
            </P>
          </>
        ),
      },
      {
        id: 'plays-queue',
        q: 'Do plays from a playlist or my queue count?',
        a: (
          <>
            <P>
              Yes. A play is a play wherever it comes from — a playlist, your
              queue, an artist page, or search. The 30-minute rule still applies
              to each song individually, so a playlist with the same track twice
              only counts it once.
            </P>
          </>
        ),
      },
      {
        id: 'plays-points',
        q: 'What are the points actually for?',
        a: (
          <>
            <P>
              They set your level, and your level is how Unis will decide access
              to live events and giveaways as those roll out. Points are the
              record of showing up.
            </P>
            <P>
              Artists and listeners both earn them, but artists have far more
              ways to — their songs earn on every play, every like, and every
              vote, on top of whatever they earn as listeners themselves.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'queue',
    title: 'Queue',
    blurb: 'What plays next, rearranging, shuffling, repeating, and saving a queue.',
    status: 'published',
    articles: [
      {
        id: 'queue-add',
        q: 'What happens when I tap a song?',
        a: (
          <>
            <P>
              If your queue is empty, it starts playing. If you already have
              songs lined up, Unis asks what you meant: <B>Play now</B> starts
              the song immediately and the rest of your queue picks up after it,
              and <B>Add to queue</B> puts it at the end, after everything
              already lined up.
            </P>
            <P>
              You are never guessing which one you got, and playing something
              never wipes out a queue you spent time building. Whole playlists
              work the same way.
            </P>
          </>
        ),
      },
      {
        id: 'queue-playlists',
        q: 'Why are some songs in my queue grouped together?',
        a: (
          <>
            <P>
              Those songs came from a playlist. When you play or queue a
              playlist, its songs arrive together, joined by a colored line down
              the left side, with the playlist&rsquo;s name above the first one.
              Tap the name to open the playlist. While one of those songs is
              playing, Now playing shows which playlist it came from.
            </P>
            <P>
              Once they arrive they are ordinary queue songs. Move them, remove
              them one at a time, or use <B>Remove all</B> on the group. None of
              that changes the playlist itself.
            </P>
          </>
        ),
      },
      {
        id: 'queue-shuffle',
        q: 'How does shuffle work?',
        a: (
          <>
            <P>
              It genuinely randomizes. Unis uses a true shuffle — every ordering
              of your queue is equally likely, with no weighting toward
              particular artists or songs.
            </P>
            <P>
              The song playing now moves to the top and keeps playing; everything
              else in your queue is reordered behind it, including songs you have
              already heard. Turning shuffle off puts your queue back in its
              original order and keeps your place. Songs you added while shuffle
              was on stay at the end, songs you removed stay removed, and songs
              you moved while shuffled go back where they were.
            </P>
          </>
        ),
      },
      {
        id: 'queue-repeat',
        q: 'Can I repeat a song or the whole queue?',
        a: (
          <>
            <P>
              Both. The repeat control cycles through three states: off, repeat
              the whole queue when it reaches the end, and repeat the current
              track.
            </P>
            <P note>
              Repeating one track will not keep earning points for it. The
              30-minute rule in Play counts still applies.
            </P>
          </>
        ),
      },
      {
        id: 'queue-manage',
        q: 'Can I rearrange, remove, or keep my queue?',
        a: (
          <>
            <P>
              Drag any song by its handle to move it. To remove a song, tap its
              trash icon — Unis asks you to confirm right there in the row, so a
              stray tap never costs you a track. The song that is playing now
              can&rsquo;t be removed; skip it instead.
            </P>
            <P>
              <B>Clear queue</B>, in the queue&rsquo;s three-dot menu, empties
              everything and stops playback, also after you confirm. The same
              menu saves your whole queue as a playlist in one step, so a good
              listening session does not have to be rebuilt from memory later.
            </P>
          </>
        ),
      },
      {
        id: 'queue-video',
        q: 'What happens to my queue when I watch a video?',
        a: (
          <>
            <P>
              Nothing. Starting a video pauses the music so the two are not
              playing over each other, but your queue is held exactly as it
              was — same tracks, same order, same position. Close the video and
              press play, and you pick up where you left off.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'playlists',
    title: 'Playlists',
    blurb: 'Making them, playing them, sharing them, and how they differ from your queue.',
    status: 'published',
    articles: [
      {
        id: 'playlists-vs-queue',
        q: 'What is the difference between a playlist and my queue?',
        a: (
          <>
            <P>
              A playlist is something you keep. Your queue is what you are
              listening to right now. A playlist survives the session; a queue
              is the session.
            </P>
            <P>
              Playing a playlist never replaces your queue. Its songs are added
              into it, with the same choice you get for a single song:{' '}
              <B>Play now</B> starts the playlist immediately and your queue
              picks up after it, and <B>Add to queue</B> lines it up after
              everything already there.
            </P>
            <P>
              Once they are in, those songs belong to your queue. Rearranging or
              removing them does not touch the playlist, and editing the
              playlist does not change a queue you already built. You can also
              send a single song from a playlist into your queue from its
              three-dot menu, or turn your whole queue into a playlist in one
              step.
            </P>
          </>
        ),
      },
      {
        id: 'playlists-play',
        q: 'What happens when I tap a song inside a playlist?',
        a: (
          <>
            <P>
              Unis plays the playlist from that song onward — the songs above it
              are left out, the same as starting an album partway through. If
              your queue already has songs, you get the Play now / Add to queue
              choice first.
            </P>
            <P>
              If that playlist is the one playing right now, tapping a song just
              jumps to it; nothing is added twice. The <B>Shuffle</B> button next
              to Play adds the whole playlist in a random order without
              reshuffling the rest of your queue.
            </P>
          </>
        ),
      },
      {
        id: 'playlists-create',
        q: 'How do I make or edit a playlist?',
        a: (
          <>
            <P>
              Two ways to make one. Create it from Playlists in the sidebar, then add
              songs as you find them: while a song is playing, tap the playlist
              button in the player and choose where it goes. Or save your current
              queue as a playlist once you have a run of tracks you want to keep.
            </P>
            <P>
              To edit a playlist you own, open it and use the three-dot menu next
              to Play to change its name, description, cover, or who can see it.
              Drag songs by their handle to reorder them, and remove a song from
              its own three-dot menu — Unis asks before removing anything.
            </P>
          </>
        ),
      },
      {
        id: 'playlists-privacy',
        q: 'Who can see my playlist?',
        a: (
          <>
            <P>
              You choose when you create it, and you can change it later.
            </P>
            <Ul>
              <Li>
                <B>Private</B> — only you. Nobody can find it, open it, or see
                that it exists. This is the default.
              </Li>
              <Li>
                <B>Unlisted</B> — anyone you send the link to can open it, but it
                does not appear in search or on the Discover page.
              </Li>
              <Li>
                <B>Public</B> — anyone on Unis can open it. It shows up in
                search and under Playlists on the Discover page.
              </Li>
            </Ul>
            <P>Community playlists are always public.</P>
          </>
        ),
      },
      {
        id: 'playlists-community',
        q: 'What are community playlists?',
        a: (
          <>
            <P>
              Playlists that belong to a jurisdiction rather than to one person.
              Anyone can suggest a song for one — while it is playing, tap the
              playlist button in the player and pick the community playlist —
              and the community decides whether it stays.
            </P>
            <P>
              A suggestion joins the playlist once it has 5 more up votes than
              down votes, and is dropped once it has 3 more down votes than up.
              Open the playlist&rsquo;s Suggestions tab to vote. You get one
              vote per suggestion and can change your mind; the vote you cast
              stays highlighted. You can&rsquo;t vote on a song you suggested
              yourself, and songs already in the playlist aren&rsquo;t voted on.
            </P>
          </>
        ),
      },
      {
        id: 'playlists-unis',
        q: 'What are Unis playlists?',
        a: (
          <>
            <P>
              Playlists put together by the platform rather than by a listener.
              They are added regularly and every user can play them.
            </P>
            <P>
              Some are curated by hand and some are built from award winners, so
              they are a fast way to hear what a jurisdiction has actually been
              voting for.
            </P>
          </>
        ),
      },
      {
        id: 'playlists-points',
        q: 'Do plays from a playlist count?',
        a: (
          <>
            <P>
              Yes, exactly the same as anywhere else. Points go to you, the song,
              and the artist, and the 30-minute rule still applies to each song
              individually — so a playlist with the same track twice only counts
              it once.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'sounds',
    title: 'Genres, subgenres and moods',
    blurb: 'How songs are tagged, how that helps people find them, and why it never changes the awards.',
    status: 'published',
    articles: [
      {
        id: 'sounds-what',
        q: 'What is the difference between a genre, a subgenre and a mood?',
        a: (
          <>
            <P>
              Unis has three <B>genres</B>: Rap, Rock and Pop. Those are the
              awards races. Every song competes in exactly one of them, and
              voting, rankings and awards only ever look at the genre.
            </P>
            <P>
              A <B>subgenre</B> is a closer description of the sound, such as
              Drill, Conscious, Punk / Emo or Afrobeats. A <B>mood</B> describes
              how the song feels, such as Hype, Chill or Heartbreak. Subgenres
              and moods exist only to help listeners find music. They never move
              a song into a different awards race, and they never add or take
              away points or votes.
            </P>
          </>
        ),
      },
      {
        id: 'sounds-tagging',
        q: 'How do I tag my song?',
        a: (
          <>
            <P>
              When you upload a song, the <B>Sound &amp; discovery</B> section asks
              for four things:
            </P>
            <Ul>
              <Li>
                <B>Subgenre</B> (required). Pick the one that fits best from your
                own genre. Each choice shows a few artists it sounds like. If
                none fits, choose <B>None of these fit</B> and describe the sound
                in a few words.
              </Li>
              <Li>
                <B>Second subgenre</B> (optional). Use it if the song also leans
                another way. It can come from any genre, so a rap song can also
                be tagged R&amp;B / Soul.
              </Li>
              <Li>
                <B>Mood</B>. Pick one or two. Your first pick is the main mood.
              </Li>
              <Li>
                <B>Language</B>. The main language of the vocals. It starts on
                English.
              </Li>
            </Ul>
            <P>
              A clean version you upload right after an explicit song gets the
              same tags automatically.
            </P>
          </>
        ),
      },
      {
        id: 'sounds-change',
        q: 'Can I change my song’s tags later, or tag a song I uploaded before?',
        a: (
          <>
            <P>
              Yes. Open your <B>Artist Dashboard</B>, find the song in your
              song list, tap the pencil icon next to it, and change the Sound
              &amp; discovery section. Then tap <B>Save Changes</B>. Songs uploaded
              before subgenres existed have no tags until you add them, and they
              will not show up on subgenre or mood shelves until you do.
            </P>
          </>
        ),
      },
      {
        id: 'sounds-find',
        q: 'Where do subgenres and moods show up for listeners?',
        a: (
          <>
            <P>
              On a song’s page, its subgenres and moods appear as chips under
              the title. Tapping one opens a shelf of songs with that same tag.
              Songs from your own area come first, then everywhere else.
            </P>
            <P>
              On <B>Discover</B>, a <B>Browse by sound</B> row lists the
              subgenres in the area you are exploring. A subgenre appears there
              once at least three songs in that area carry it, so you never open
              an empty shelf.
            </P>
            <P>
              The <B>Recommended</B> row on a song’s page suggests what to hear
              next. It looks first for songs with the same subgenre from the
              same neighborhood, keeps one spot for another song by the same
              artist, and widens the search when there are not enough close
              matches. Playing a recommended song gives you the usual Play now
              or Add to queue choice.
            </P>
          </>
        ),
      },
      {
        id: 'sounds-other',
        q: 'My sound is not on the list. What happens to what I write in?',
        a: (
          <>
            <P>
              We read every description written in under <B>None of these
              fit</B> and use them to decide which subgenres to add next. Until
              then, the song still competes in its genre and can still be found
              by its moods.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'upload-rights',
    title: 'What you can upload',
    blurb: 'Which songs can go on Unis for now, why, and what Unis gets when you upload.',
    status: 'published',
    articles: [
      {
        id: 'upload-rights-which',
        q: 'Which songs can I upload?',
        a: (
          <>
            <P>
              For now, Unis can only take music you control yourself. Every
              upload asks you to tick a box confirming four things about the
              song, or about the music in your video:
            </P>
            <Ul>
              <Li>
                <B>You wrote it.</B> If someone co-wrote it or made the beat,
                they&rsquo;re fine with it being on Unis.
              </Li>
              <Li>
                <B>No publisher handles it.</B> That includes publishing
                administrators such as Songtrust or TuneCore Publishing. If you
                signed up for one, it counts, even if you never thought of it as
                having a publisher.
              </Li>
              <Li>
                <B>No one who wrote it is with SESAC or GMR.</B> ASCAP and BMI
                writers can upload.
              </Li>
              <Li>
                <B>It isn&rsquo;t a cover</B>, and any sample in it is cleared.
              </Li>
            </Ul>
            <P>
              If any of these isn&rsquo;t true, the song can&rsquo;t go on Unis
              yet. The upload won&rsquo;t go through until the box is ticked.
            </P>
          </>
        ),
      },
      {
        id: 'upload-rights-why',
        q: 'Why can’t I upload a song with a publisher, or a cover?',
        a: (
          <>
            <P>
              Every song has two parts: the recording, and the song itself, its
              music and lyrics. When you upload music you control, you license
              both to Unis yourself.
            </P>
            <P>
              When a publisher, a publishing administrator, SESAC or GMR handles
              the song, or it&rsquo;s someone else&rsquo;s song, as a cover is,
              Unis would need licenses from The Mechanical Licensing Collective
              and the performing rights organizations to play it. Unis
              doesn&rsquo;t have those yet, so those songs can&rsquo;t go up for
              now.
            </P>
          </>
        ),
      },
      {
        id: 'upload-rights-pro',
        q: 'I’m with ASCAP or BMI. Can I still upload?',
        a: (
          <>
            <P>
              Yes. ASCAP and BMI hold only non-exclusive rights to their
              writers&rsquo; songs, so you can license your own songs to Unis
              directly.
            </P>
            <P>
              Unis doesn&rsquo;t pay through ASCAP or BMI yet, so plays on Unis
              won&rsquo;t appear on your statements from them. What you earn on
              Unis comes from Unis itself: your supporters&rsquo; share, Unis
              Plus, song sales and referrals.
            </P>
          </>
        ),
      },
      {
        id: 'upload-rights-license',
        q: 'What does Unis get when I upload?',
        a: (
          <>
            <P>
              A non-exclusive license to the recording and the song, so Unis can
              stream it, show it on Unis, and sell or give away downloads if you
              turn them on. Your share of Unis&rsquo;s income is what you get for
              it.
            </P>
            <P>
              You keep ownership of everything, you can put the song anywhere
              else, and the license ends when you take the song down. Section 3
              of the <A href="/terms">Terms of Service</A> has the full wording.
            </P>
          </>
        ),
      },
      {
        id: 'upload-rights-change',
        q: 'What if I sign with a publisher later?',
        a: (
          <>
            <P>
              Take the song down from your dashboard. A song can only stay on
              Unis while you still control it. If Unis adds licenses for
              published songs later, you&rsquo;ll be able to put it back.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'verification',
    title: 'Phone verification',
    blurb: 'Why Unis asks for a number and what it unlocks.',
    status: 'published',
    articles: [
      {
        id: 'verification-why',
        q: 'Why does Unis want my phone number?',
        a: (
          <>
            <P>
              To keep bots out. Everything that decides an outcome on Unis — who
              wins an award, who gets paid — runs on the assumption that one
              account is one person. An email address takes seconds to fake. A
              phone number does not.
            </P>
            <P>
              Verifying is what separates a listener from a script. It is the
              single measure standing between a local award and someone with a
              thousand throwaway accounts.
            </P>
          </>
        ),
      },
      {
        id: 'verification-how',
        q: 'How do I verify?',
        a: (
          <>
            <P>
              From Settings. Enter your number, and Unis texts you a six-digit
              code. Type it back in and you are verified — it takes under a
              minute and you only do it once.
            </P>
            <P note>
              If the code does not arrive, check the number for a typo and
              request a new one. Codes expire, so an old text will not work.
            </P>
          </>
        ),
      },
      {
        id: 'verification-unlocks',
        q: 'What does verifying unlock?',
        a: (
          <>
            <P>Four things stay locked until you verify:</P>
            <Ul>
              <Li><B>Voting</B> — in every jurisdiction and every interval.</Li>
              <Li><B>Commenting</B> — on songs, videos, and artist pages.</Li>
              <Li><B>Messaging</B> — sending direct messages to other users.</Li>
              <Li><B>Earnings</B> — the Community Share only pays verified accounts.</Li>
            </Ul>
            <P>
              That last one is worth reading twice. If you are an artist with
              supporters, or you referred people to Unis,{' '}
              <B>you do not earn anything until your phone is verified</B>. The
              listening still counts, but your part of any month that closes
              before you verify stays with Unis. It is not held for you.
            </P>
          </>
        ),
      },
      {
        id: 'verification-without',
        q: 'What can I do without verifying?',
        a: (
          <>
            <P>
              Most of Unis. You can play music, like songs, follow artists,
              build playlists, browse leaderboards, and support an artist
              without ever entering a number.
            </P>
            <P>
              Verification is not a gate on listening. It is a gate on the
              things where a fake account would do damage.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'follow',
    title: 'Following',
    blurb: 'Following artists and listeners, and what it changes.',
    status: 'published',
    articles: [
      {
        id: 'follow-what',
        q: 'What does following someone do?',
        a: (
          <>
            <P>
              It is how you keep track of people on Unis. Follow an artist whose
              releases you want to catch, or a listener whose taste you trust.
            </P>
            <P>
              You can follow both — artists and listeners alike. Unfollow at any
              time, from the same button.
            </P>
          </>
        ),
      },
      {
        id: 'follow-visible',
        q: 'Can people see that I followed them?',
        a: (
          <>
            <P>
              They can see the count. Follower totals are public and show on
              every profile, including to signed-out visitors — for an artist,
              it is part of how their standing reads at a glance.
            </P>
          </>
        ),
      },
      {
        // ⚠ REWRITTEN for the two-lane messaging model, and only true once the
        // new messaging backend is deployed. The previous version said
        // restricting messages limits you to "only people you follow" — true of
        // the old single-lane gate, not of this one: supporters also get
        // through, and an unrestricted account still hears from strangers, just
        // in a different place. Ships in the same PR as the `messaging` section.
        id: 'follow-messages',
        q: 'Does following change who can message me?',
        a: (
          <>
            <P>
              Yes. Following someone puts their messages in your inbox instead
              of your requests folder — it is one of the two connections Unis
              treats as knowing a person. The other is support.
            </P>
            <P>
              Note the direction: it is who <Em>you</Em> follow, not who follows
              you. An artist with a large following still only gives inbox
              access to the people they chose to keep track of.
            </P>
            <P>
              If you tighten your message settings to <B>people you know</B>,
              that same pair is the whole list — artists you follow and
              listeners who support you. Everyone else cannot start a
              conversation with you at all.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'likes',
    title: 'Likes',
    blurb: 'What a like is worth, who can see it, and how it differs from a vote.',
    status: 'published',
    articles: [
      {
        id: 'likes-what',
        q: 'What does liking a track do?',
        a: (
          <>
            <P>
              It pays three ways at once. You earn <B>1 point</B>, the track
              earns <B>2</B>, and the artist earns <B>1</B>. Songs and videos
              work identically.
            </P>
            <P>
              A like is worth double to the track precisely because it costs you
              a deliberate tap. A play can happen because a queue rolled on. A
              like only happens because somebody meant it.
            </P>
          </>
        ),
      },
      {
        id: 'likes-vs-votes',
        q: 'How is a like different from a vote?',
        a: (
          <>
            <P>
              A like is unlimited and instant. A vote is scarce and decides an
              award. You can like every track you hear today; you get one vote
              per interval, per category, per place.
            </P>
            <P>
              Likes still reach the awards, just not first. If two nominees tie
              on votes and then on plays, likes are the next thing that
              separates them — so a track with real affection behind it wins the
              close ones.
            </P>
            <P note>
              Liking does not require a verified phone number. Voting does.
            </P>
          </>
        ),
      },
      {
        id: 'likes-public',
        q: 'Can people see what I liked?',
        a: (
          <>
            <P>
              They see the number, not the name. Every track shows its like
              count publicly, including to signed-out visitors, and an
              artist&rsquo;s profile shows their total likes across everything
              they have released.
            </P>
            <P>
              Which individual accounts liked a track is not shown anywhere on
              Unis.
            </P>
          </>
        ),
      },
      {
        id: 'likes-unlike',
        q: 'What happens if I unlike something?',
        a: (
          <>
            <P>
              The like comes off the track and its count drops by one. Points
              already earned stay where they are — yours, the track&rsquo;s, and
              the artist&rsquo;s.
            </P>
            <P>
              Liking it again later doesn&rsquo;t pay again. A like pays once
              per track, ever, and keeps the date of your first like — so it
              counts toward the award period you first liked it in, not a new
              one.
            </P>
            <P>
              Points are a record of what happened, not a running tally of what
              you currently feel. You liked it at the time, and the score keeps
              that.
            </P>
          </>
        ),
      },
      {
        id: 'likes-artist',
        q: 'What do likes do for an artist?',
        a: (
          <>
            <P>
              Three things. They add to the track&rsquo;s score, which feeds its
              standing on leaderboards. They add to the artist&rsquo;s own score
              and level. And they sit third in the tiebreaker when an award comes
              down to the wire.
            </P>
            <P>
              A track with strong likes and modest votes is usually a record
              people love but have not thought to back yet. That gap is worth
              watching — it is often the clearest sign of what to push.
            </P>
          </>
        ),
      },
    ],
  },
  {
    // Published with the messaging lanes backend (Oct 2026): MessagingService
    // + sql/V2026_10f__messaging_lanes.sql. Every article below matches that
    // code. Photo messages were removed from the copy — they aren't built, and
    // rule 1 of this file is that nothing describes intended behaviour.
    id: 'messaging',
    title: 'Messages',
    blurb: 'Who can reach you, how requests work, and messaging artists directly.',
    status: 'published',
    articles: [
      {
        id: 'messaging-who',
        q: 'Can anyone message me?',
        a: (
          <>
            <P>
              Anyone can write to you, but not everyone reaches your inbox. Unis
              splits messages into two places, and where a message lands depends
              on whether you already have a connection to the person sending it.
            </P>
            <MessageLanes />
            <P>
              Your inbox is for people you have some link with. Requests is for
              everyone else — a holding area you check when you feel like it,
              not a queue that interrupts you.
            </P>
            <P note>
              This applies to listeners and artists equally. There is no separate
              set of rules for artists, and no request to accept before you can
              talk to someone.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-requests',
        q: 'What is a message request?',
        a: (
          <>
            <P>
              The first message from someone you have no connection to. It waits
              in Requests instead of arriving in your inbox, and while it waits
              it is deliberately limited:
            </P>
            <Ul>
              <Li>
                <B>They can send one message.</B> Not a stream — one. They
                cannot write again until you accept.
              </Li>
              <Li>
                <B>Text only.</B> No tracks, no support, nothing attached. Those
                unlock after you accept.
              </Li>
              <Li>
                <B>You are not notified.</B> A request never rings, buzzes, or
                pushes to your phone.
              </Li>
              <Li>
                <B>They cannot tell you read it.</B> No <Em>Seen</Em> mark is
                sent from a request, ever.
              </Li>
            </Ul>
            <P>
              So you can open a request, read it fully, and walk away, and the
              person who sent it learns nothing at all.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-accept',
        q: 'What happens when I accept or delete a request?',
        a: (
          <>
            <P>
              <B>Accept</B> moves the conversation into your inbox. From then on
              they can message you normally and send tracks and support, and you
              are talking like any other thread.
            </P>
            <P>
              <B>Delete</B> removes it. The sender is never told — no notice, no
              read mark, nothing that distinguishes a declined request from one
              you simply have not opened.
            </P>
            <P>
              <B>Block</B> deletes it and stops that account reaching you again.
            </P>
            <P note>
              Replying counts as accepting. If you just answer the message, the
              conversation moves to your inbox on its own — you never have to do
              both.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-artists',
        q: 'How do I message an artist?',
        a: (
          <>
            <P>
              From their profile — the Message button opens a conversation with
              them. You can also start one from your inbox and search for them
              by name.
            </P>
            <P>
              If you follow each other, or you support them, you land in their
              inbox. Otherwise your first message waits in their requests,
              exactly like anyone else&rsquo;s.
            </P>
            <P>
              <B>Supporting an artist puts you in their inbox.</B> If you are
              putting money behind an artist, your message does not sit in a
              holding folder — it goes straight to them. Artists can turn this
              off, but it is on by default.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-inside',
        q: 'What can I do inside a conversation?',
        a: (
          <>
            <P>Three things, beyond typing:</P>
            <Ul>
              <Li>
                <B>Share a track.</B> It arrives as a playable card with the
                song&rsquo;s current standing in its jurisdiction, so you are
                sending a place on the board, not just a link.
              </Li>
              <Li>
                <B>Send support</B> (to artists). Money and a note in the same
                message. It appears in the thread as its own bubble, and it
                counts as support exactly like sending it from a profile. Up to
                $100 a payment, and $250 a day or $500 a week in total; your
                account needs a verified phone and to be at least a week old.
              </Li>
              <Li>
                <B>React.</B> One emoji per message. Tapping the same one again
                removes it.
              </Li>
            </Ul>
            <P note>
              Tracks, support, and reactions are not available in a request.
              They unlock once the other person accepts.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-control',
        q: 'Can I control who messages me?',
        a: (
          <>
            <P>
              Yes — open Messages and tap the settings button at the top. There
              are three choices:
            </P>
            <Ul>
              <Li>
                <B>Everyone.</B> Anyone can write; people you do not know land
                in requests. This is the default.
              </Li>
              <Li>
                <B>People you know.</B> Only artists you follow and listeners
                who support you. Nobody else can start a conversation with you
                at all.
              </Li>
              <Li>
                <B>No one.</B> Nobody new can write to you. You can still start
                conversations yourself.
              </Li>
            </Ul>
            <P>
              Whatever you choose, <B>anyone you have already messaged can
              always reach you</B>. Tightening this setting never cuts off a
              conversation you are already in.
            </P>
            <P note>
              The same screen holds your active status, your read receipts, the
              spam filter, and your blocked accounts.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-seen',
        q: 'Can people tell when I have read a message?',
        a: (
          <>
            <P>
              In an accepted conversation, yes — a <Em>Seen</Em> mark appears
              under their last message once you open it. In a request, never.
            </P>
            <P>
              You can turn read receipts off in Settings, and the same is true of
              your active status. Both are <B>mutual</B>: switch receipts off and
              you stop seeing when others have read yours; switch active status
              off and you stop seeing who is online.
            </P>
            <P>
              That is deliberate. A setting that let you watch other people while
              staying invisible yourself would not be a privacy control, it would
              be an advantage.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-spam',
        q: 'What stops people from spamming me?',
        a: (
          <>
            <P>Five rules, working together:</P>
            <Ul>
              <Li>
                <B>A verified phone number is required to send.</B> No verified
                number, no messages — the same gate as voting.
              </Li>
              <Li>
                <B>Strangers get one message.</B> Nobody can pile message after
                message into your requests folder.
              </Li>
              <Li>
                <B>That message is text only.</B> No images or attachments can
                reach you from someone you have not accepted.
              </Li>
              <Li>
                <B>{MESSAGE_REQUEST_DAILY_LIMIT} new people per day.</B> One
                account can only start conversations with{' '}
                {MESSAGE_REQUEST_DAILY_LIMIT} people it does not know in a day.
                Bulk outreach hits a wall quickly.
              </Li>
              <Li>
                <B>Bulk and low-quality messages are filtered.</B> They go to a
                separate folder rather than your requests. You can switch this
                off.
              </Li>
            </Ul>
            <P>
              None of this applies to people you already know. The limits exist
              at the point of first contact, which is the only place spam comes
              from.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-block',
        q: 'How do I block or report someone?',
        a: (
          <>
            <P>
              Both are in the menu at the top of any conversation, and blocking
              is also offered directly on a request.
            </P>
            <P>
              <B>Blocking</B> stops messages in both directions — they cannot
              write to you and you cannot write to them until you unblock. If
              they had a request waiting, it is deleted. Your blocked accounts
              are listed in message settings and you can undo it there.
            </P>
            <P>
              <B>Reporting</B> sends the conversation to Unis for review.
              Reporting does not block on its own, so block as well if you do
              not want to hear from them while it is looked at.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-broadcast',
        q: 'Why did an artist I support message me?',
        a: (
          <>
            <P>
              Artists can send one message to everyone supporting them. It
              arrives as a normal conversation, not an announcement — you can
              reply, and your reply goes to the artist alone.
            </P>
            <P>
              Only people who support that artist receive it. Blocking an artist
              stops their broadcasts along with everything else.
            </P>
          </>
        ),
      },
      {
        id: 'messaging-cant',
        q: 'Why can I not message someone?',
        a: (
          <>
            <P>There are five reasons a message will not send:</P>
            <Ul>
              <Li>
                <B>Your phone is not verified.</B> Add a number in Settings.
              </Li>
              <Li>
                <B>They only accept messages from people they know.</B> Follow
                them or support them, and you will reach them.
              </Li>
              <Li>
                <B>They are not accepting new messages.</B> Their inbox is
                closed to people they have not written to.
              </Li>
              <Li>
                <B>One of you has blocked the other.</B>
              </Li>
              <Li>
                <B>You have already sent them a request.</B> Wait for it to be
                accepted rather than sending again.
              </Li>
            </Ul>
            <P note>
              Every refusal tells you which one it was, except a block — that one
              is deliberately vague in both directions.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'comments',
    title: 'Comments',
    blurb: 'Leaving them, replying, editing, and the limits that keep threads readable.',
    status: 'published',
    articles: [
      {
        id: 'comments-who',
        q: 'Who can comment?',
        a: (
          <>
            <P>
              Anyone with a verified phone number. Comments sit behind the same
              gate as voting, for the same reason — a comment section that
              anyone can fill from a script stops being worth reading within a
              week.
            </P>
            <P>
              Reading is open to everyone. You can browse every comment on Unis
              without an account at all; you just cannot add one until you
              verify.
            </P>
          </>
        ),
      },
      {
        id: 'comments-limit',
        q: 'Why can I not comment again on this song?',
        a: (
          <>
            <P>
              You get <B>{COMMENTS_PER_TRACK}</B> comments on any one song or
              video. Once you have used them, the box closes for that track.
            </P>
            <P>
              The limit exists so no single person can dominate a track&rsquo;s
              comments. Three is enough to say something real and not enough to
              take the section over.
            </P>
            <P note>
              One exception, and it matters: <B>you can always reply underneath
              your own comment</B>, even after you have used all{' '}
              {COMMENTS_PER_TRACK}. If somebody responds to you, you are never
              locked out of answering them.
            </P>
          </>
        ),
      },
      {
        id: 'comments-replies',
        q: 'Can I reply to a reply?',
        a: (
          <>
            <P>
              No. Threads go one level deep — a comment, and replies underneath
              it. Replying to a reply puts your response under the original
              comment instead.
            </P>
            <P>
              Deeply nested threads collapse into unreadable columns on a phone,
              and the conversation drifts away from the song it is supposed to
              be about. One level keeps every reply attached to the thing that
              started it.
            </P>
          </>
        ),
      },
      {
        id: 'comments-edit',
        q: 'Can I edit or delete a comment?',
        a: (
          <>
            <P>
              Both, on your own comments, at any time. There is no window that
              closes — a typo from last year is still fixable.
            </P>
            <P>
              A deleted comment disappears from the track along with its
              replies&rsquo; context. Editing keeps the comment in place and
              simply changes what it says.
            </P>
          </>
        ),
      },
      {
        id: 'comments-artist-delete',
        q: 'Can an artist delete comments on their own song?',
        a: (
          <>
            <P>
              Yes. An artist can remove any comment on their own songs and
              videos, not just their own comments.
            </P>
            <P>
              Your page is yours. An artist should not have to wait on a
              moderation queue to take something off their own release. It only
              extends to their own media — nobody can reach into someone
              else&rsquo;s comments.
            </P>
          </>
        ),
      },
      {
        id: 'comments-length',
        q: 'Is there a length limit?',
        a: (
          <>
            <P>
              {COMMENT_MAX_LENGTH.toLocaleString()} characters, which is several
              paragraphs. Long enough for a real thought about a record, short
              enough that nobody is pasting an essay into a track page.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'waitlist',
    title: 'Waitlist',
    blurb: 'Unis is not everywhere yet. How a region gets unlocked, and how you speed it up.',
    status: 'published',
    articles: [
      {
        id: 'waitlist-why',
        q: 'Why can I not use Unis where I live?',
        a: (
          <>
            <P>
              Because Unis only works when a place is actually populated. The
              whole platform is built on local competition — awards, rankings,
              a scene voting on its own artists. Open a city with eleven people
              in it and every award is meaningless on day one.
            </P>
            <P>
              So Unis opens region by region, and a region opens when enough
              people from it have signed up to make it a real scene rather than
              an empty leaderboard.
            </P>
          </>
        ),
      },
      {
        id: 'waitlist-threshold',
        q: 'How many people does my region need?',
        a: (
          <>
            <P>
              It depends on the size of the place. A major metro needs more
              people to feel populated than a small city does, so the bar moves
              with the market.
            </P>
            <WaitlistTiers />
            <P>
              You can see exactly where your region stands the moment you sign
              up — the live count, the target, and how many more are needed.
            </P>
          </>
        ),
      },
      {
        id: 'waitlist-signup',
        q: 'What happens when I join the waitlist?',
        a: (
          <>
            <P>
              You enter the referral code of whoever told you about Unis, pick
              your state and your metro area, choose whether you are a listener
              or an artist, and set your username and password.
            </P>
            <P>
              Every sign-up needs a referral code, on the waitlist too. Everyone
              hears about Unis from someone, and that person gets the credit. A
              friend&rsquo;s waitlist code, a member&rsquo;s code, or the code on
              a Unis poster all work.
            </P>
            <P>
              Your username is reserved from that moment. Nobody else can take
              it while you wait, in any capitalization.
            </P>
            <P note>
              If your city is not in the list, choose <B>Other</B> and type it
              in. It becomes its own region with its own count, so small towns
              are not stuck waiting behind a metro they do not belong to.
            </P>
          </>
        ),
      },
      {
        id: 'waitlist-faster',
        q: 'Can I make my region open faster?',
        a: (
          <>
            <P>
              Yes, and this is the only thing that actually moves it. You get a
              referral code when you join. Everyone who signs up with it counts
              toward your region&rsquo;s total.
            </P>
            <P>
              There is no queue position to climb and no way to skip ahead
              alone — a region opens for everyone at once or not at all. The
              only lever is bringing more of your city with you.
            </P>
            <P>
              Codes look like <B>UNIS-XXXXXX</B>, and they deliberately leave
              out characters that are easy to confuse, so a code read aloud or
              written down still works.
            </P>
          </>
        ),
      },
      {
        id: 'waitlist-notified',
        q: 'How will I know when my region opens?',
        a: (
          <>
            <P>
              Email, the moment it activates. That is the only thing your
              address is used for on the waitlist — no newsletters, and your
              details are not passed to anyone else.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'jurisdiction',
    title: 'Jurisdictions',
    blurb: 'Your place on Unis, and what it decides.',
    status: 'published',
    articles: [
      {
        id: 'jurisdiction-what',
        q: 'What is a jurisdiction?',
        a: (
          <>
            <P>
              A place, and your place on Unis. Every listener and every artist
              belongs to one — a neighborhood, not a city — and each neighborhood
              sits inside a larger one, all the way up to Unis itself.
            </P>
            <JurisdictionLadder />
            <P>
              This is the idea the rest of the platform is built on. Music is
              local before it is anything else, and a neighborhood is a real
              scene in a way that a country is not.
            </P>
          </>
        ),
      },
      {
        id: 'jurisdiction-mine',
        q: 'How is my jurisdiction decided?',
        a: (
          <>
            <P>
              From the address you give when you create your account. Unis finds
              the most specific neighborhood that contains it — not the city, not
              the state, the smallest place you actually belong to.
            </P>
            <P note>
              You can see yours at the top of the sidebar at any time. Tapping it
              opens your jurisdiction&rsquo;s page.
            </P>
          </>
        ),
      },
      {
        id: 'jurisdiction-does',
        q: 'What does my jurisdiction decide?',
        a: (
          <>
            <P>Four things, and they are the four that matter most:</P>
            <Ul>
              <Li>
                <B>Where you can vote.</B> Your own neighborhood, and every
                jurisdiction above it.
              </Li>
              <Li>
                <B>Which awards you compete for,</B> if you are an artist. Your
                neighborhood&rsquo;s, and every one above it.
              </Li>
              <Li>
                <B>Which leaderboards you appear on.</B> You are ranked in each
                place you belong to, separately.
              </Li>
              <Li>
                <B>What you see first.</B> Your feed and the Find page lead with
                what is happening where you are.
              </Li>
            </Ul>
          </>
        ),
      },
      {
        id: 'jurisdiction-upward',
        q: 'Why can I vote in places I do not live?',
        a: (
          <>
            <P>
              You cannot — but the places above you count as yours. Your city
              contains your neighborhood, your state contains your city, and Unis
              contains everything, so all of them are places you are genuinely
              part of.
            </P>
            <P>
              What you cannot do is vote sideways. A neighborhood you do not
              belong to is closed to you, however close it is, and that is what
              keeps a local award local.
            </P>
          </>
        ),
      },
      {
        id: 'jurisdiction-page',
        q: 'What is on a jurisdiction page?',
        a: (
          <>
            <P>
              What that place is listening to. Its song of the week, its leading
              artists and songs, and its full record of past winners going back
              as far as the place has existed on Unis.
            </P>
            <P>
              Any jurisdiction is open to browse, whether you belong to it or
              not. You just cannot vote there.
            </P>
          </>
        ),
      },
      {
        // ⚠ VERIFY BEFORE SHIPPING. There is no endpoint that changes a user's
        // jurisdiction after registration — `setJurisdiction` is only called in
        // UserController.register. This copy is written to be true either way
        // (it does not promise self-service and does not rule it out), but if
        // you intend to add a move flow, rewrite this rather than shipping it
        // as the permanent answer.
        id: 'jurisdiction-change',
        q: 'What if I move, or my jurisdiction is wrong?',
        a: (
          <>
            <P>
              Your jurisdiction is set once, when you create your account, and it
              stays put after that. If the wrong one was picked, or you have
              moved, contact us and we will correct it.
            </P>
            <P>
              It is deliberately not a switch you can flip. If people could
              change neighborhood freely, anyone could move into whichever race
              they were most likely to win, and every local award would stop
              meaning anything.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'referrals',
    title: 'Referrals',
    blurb: 'Your code, the three levels, and what inviting someone is actually worth.',
    status: 'published',
    articles: [
      {
        id: 'referrals-code',
        q: 'Where is my referral code?',
        a: (
          <>
            <P>
              You already have one. Unis generates it the moment you create your
              account — your username, a dash, and five random
              characters. Anyone who signs up with it is permanently linked to
              you.
            </P>
            <P>
              It never expires, there is no cap on how many people can use it,
              and you cannot lose it.
            </P>
          </>
        ),
      },
      {
        id: 'referrals-levels',
        q: 'What are the three levels?',
        a: (
          <>
            <P>
              Referrals pay three steps down, not one. Every month Unis shares
              what it took in with the community, divided by listening. Part of
              each person&rsquo;s share goes to the person who invited them, the
              person who invited <Em>that</Em> person, and one step further back
              again.
            </P>
            <RevenueSplit />
            <P>
              So you earn from people you have never met. Invite one person who
              turns out to be a connector, and their whole branch adds to your
              monthly share for as long as they keep listening.
            </P>
            <P note>
              The chain stops at three. Nothing reaches a fourth step, and there
              is no arrangement where inviting people is your only reason to be
              here.
            </P>
          </>
        ),
      },
      {
        id: 'referrals-points',
        q: 'Do I get points for referring someone?',
        a: (
          <>
            <P>
              Yes, the moment they sign up — separate from any money their
              listening later brings you. Points land immediately; money arrives
              once a month, when each month is closed.
            </P>
            <P>
              A referral is one of the largest single point awards a listener
              can earn outside of curating, because bringing a real person into
              a local scene is worth more than any single play.
            </P>
            <P note>
              If they delete their account within 30 days of joining, those
              points come off again.
            </P>
          </>
        ),
      },
      {
        id: 'referrals-when',
        q: 'When do I start earning from someone I referred?',
        a: (
          <>
            <P>
              From the day they start listening. Their plays count straight
              away, and your part of their share arrives when that month is
              closed — usually in the second half of the following month, once
              Unis has been paid for it.
            </P>
            <P>
              Three things can stop it. <B>They have to be signed in</B> — a
              signed-out visitor&rsquo;s plays count for nobody. <B>Their phone
              has to be verified</B> — plays from accounts without a verified
              phone don&rsquo;t count, which is what stops anyone from farming
              the share with fake accounts. And <B>your phone has to be
              verified</B>, or your part stays with Unis.
            </P>
            <P note>
              Plays of their own songs don&rsquo;t count, and each person counts
              for at most 50 plays a day, so nobody can inflate a share by
              leaving music running.
            </P>
          </>
        ),
      },
      {
        id: 'referrals-nocode',
        q: 'What if I forgot to enter a code when I signed up?',
        a: (
          <>
            <P>
              Then no referrer was recorded, and that cannot be changed
              afterward. The link is made once, at signup, from the code in the
              form.
            </P>
            <P>
              An unclaimed referral share stays with Unis. It is not reassigned
              and it does not roll to anyone else.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'supporter',
    title: 'Supporting an artist',
    blurb: 'Choosing one, switching later, and why the change waits for the 1st.',
    status: 'published',
    articles: [
      {
        id: 'supporter-what',
        q: 'What does supporting an artist mean?',
        a: (
          <>
            <P>
              One artist shares in your presence on Unis. Every month, 15% of
              your slice of the Community Share — your share of the pot, based
              on your signed-in listening — goes to them. Not to you, not to the platform alone,
              to a specific artist you picked.
            </P>
            <P>
              You choose when you sign up and you always have one. It costs you
              nothing beyond being here, which is the whole idea: listening is
              already the contribution.
            </P>
          </>
        ),
      },
      {
        id: 'supporter-choose',
        q: 'Who can I support?',
        a: (
          <>
            <P>
              Any artist on Unis, anywhere — you are not limited to your own
              jurisdiction. The one person you cannot support is yourself, if
              you are an artist.
            </P>
            <P>
              Most people back somebody local, and that is what keeps money
              circulating inside a scene rather than draining out of it. But the
              choice is genuinely yours.
            </P>
          </>
        ),
      },
      {
        id: 'supporter-switch',
        q: 'Can I switch artists?',
        a: (
          <>
            <P>
              Whenever you like, but the change takes effect on the <B>1st of
              next month</B>, not immediately. Until then your current artist
              stays effective and keeps earning.
            </P>
            <P>
              Your first-ever pick is the exception — that one takes effect
              straight away, because there is nobody being switched away from.
            </P>
            <P note>
              A queued change is visible on your profile until it lands, and you
              can cancel it or pick somebody else right up until the 1st. The
              last choice standing at the month boundary is the one that takes.
            </P>
          </>
        ),
      },
      {
        id: 'supporter-why-wait',
        q: 'Why does switching wait until the 1st?',
        a: (
          <>
            <P>
              So artists can count on the month they are in. If support could
              move mid-month, an artist&rsquo;s income would swing daily and
              nobody could plan around it.
            </P>
            <P>
              Nothing you have already earned for an artist is ever taken back.
              Every play is stamped with whoever was effective at that moment,
              so a departing artist keeps their share of every play from the
              time they were yours. The switch changes the future, never the past.
            </P>
          </>
        ),
      },
      {
        id: 'supporter-artist-side',
        q: 'What do I get as an artist when someone supports me?',
        a: (
          <>
            <P>
              Points immediately, and income for as long as they stay. Each new
              supporter adds 5 to your score — once per person, so someone who
              leaves and comes back doesn&rsquo;t pay it twice — and from then
              on 15% of their monthly slice of the Community Share comes to
              you, based on their listening.
            </P>
            <P>
              This is the most durable income on Unis. A play is one moment; a
              supporter is somebody quietly adding to your monthly share every
              time they listen.
            </P>
            <P note>
              Your phone has to be verified for any of it to reach you. Without
              it the listening still counts, but your part stays with Unis.
            </P>
          </>
        ),
      },
      {
        id: 'supporter-leaves',
        q: 'What if the artist I support leaves Unis?',
        a: (
          <>
            <P>
              Your support ends the moment they leave. If you had already picked
              your next artist for the 1st, that switch happens right away.
              Otherwise pick a new one whenever you&rsquo;re ready — it starts
              immediately, with no wait for the 1st.
            </P>
            <P>
              Until you pick, the supporter share of your listening goes to
              Unis. It starts going to your new artist as soon as you choose.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'payouts',
    title: 'Earnings and payouts',
    blurb: 'Where the money comes from, who it goes to, and how you get paid.',
    status: 'published',
    articles: [
      {
        id: 'payouts-source',
        q: 'Where does the money come from?',
        a: (
          <>
            <P>Two places, and they never mix.</P>
            <P>
              <B>Money that is already an artist&rsquo;s</B> &mdash; a song
              someone buys from them, support someone sends them &mdash; goes
              straight to that artist, minus Unis&rsquo;s fee. It is never
              pooled or shared with anyone else.
            </P>
            <P>
              <B>Money that is Unis&rsquo;s own</B> &mdash; advertising,
              sponsorships and anything else Unis earns, plus what Unis keeps
              from its fees after the card company&rsquo;s cut &mdash; goes into
              one pot each month. That pot is the Community Share. After the
              month ends and Unis has actually been paid for it, the pot is
              divided by listening, to a fixed formula.
            </P>
            <P>
              You have to be signed in, with a verified phone number, for your
              listening to count. Nobody is paid for seeing or clicking ads.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-slice',
        q: 'What exactly is the 15% (or the 10%, 5% and 2%) a percentage of?',
        a: (
          <>
            <P>Of a listener&rsquo;s <B>slice</B> of that month&rsquo;s pot. It works in two steps:</P>
            <Ul>
              <Li>
                <B>Every listener gets a slice.</B> The pot is divided by
                counted plays: your slice is the pot &times; your plays &divide;
                everyone&rsquo;s plays that month.
              </Li>
              <Li>
                <B>Each slice is split.</B> 15% goes to the artist that listener
                supports; 10%, 5% and 2% go to the three people above them in
                the referral chain; the rest stays with Unis.
              </Li>
            </Ul>
            <P>
              An example. Say the pot is $1,000 and Unis counted 100,000 plays
              that month. Maya made 500 of them, so her slice is $5.00. Her
              artist gets 75&cent;, whoever invited her gets 50&cent;, the next
              two up get 25&cent; and 10&cent;, and Unis keeps $3.40. An artist
              with 200 supporters who listen like Maya earns $150 that month.
            </P>
            <P note>
              A play counts when you&rsquo;re signed in with a verified phone
              number, it&rsquo;s someone else&rsquo;s song, and you&rsquo;re
              under 50 counted plays for the day. Unis staff and test accounts
              don&rsquo;t count.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-one-source',
        q: 'If Unis only earned money from one thing, who does it go to?',
        a: (
          <>
            <P>
              Everyone in the Community Share, the same way. The pot doesn&rsquo;t
              care where its money came from: if ads were Unis&rsquo;s only
              income one month, the pot is the ad money; if it was a sponsor,
              it&rsquo;s that.
            </P>
            <P>
              Each person&rsquo;s slice depends on the whole pot and on
              listening &mdash; not on what they personally bought, saw or did.
              Buying a song from an artist doesn&rsquo;t pay that buyer&rsquo;s
              referrers; the artist keeps their part, and only Unis&rsquo;s small
              margin joins the pot.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-split',
        q: 'Who gets paid from my listening?',
        a: (
          <>
            <P>
              Never you: the artist you support, whoever invited you to Unis,
              and the two people above them in the chain.
            </P>
            <RevenueSplit />
            <P>
              You cannot earn from your own listening. That is deliberate — it
              removes any reason to farm your own plays, and it means the money
              moves outward through the community instead of in a circle.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-sales-fee',
        q: 'How much does Unis take when someone buys my song or supports me?',
        a: (
          <>
            <P>
              10% &mdash; or, on smaller amounts, just enough to cover the card
              company&rsquo;s fee plus one cent, whichever is higher. The buyer
              pays your price and nothing more; you get the rest.
            </P>
            <FeeExamples />
            <P>
              Why the floor? Card companies charge about 30&cent; on every
              payment, whatever its size. On a $1.99 song, 10% is 20&cent;
              &mdash; less than the card fee &mdash; so Unis would lose money on
              every small sale. Under about $4.35, Unis takes the card fee plus
              1&cent; and nothing more; from about $4.35 up it&rsquo;s a flat
              10%.
            </P>
            <P note>
              The lowest price you can set is {formatCents(MIN_SONG_PRICE_CENTS)} &mdash;
              5&cent; under the iTunes Store&rsquo;s 99&cent; songs &mdash; so
              your music can always be cheapest on Unis.
            </P>
            <P>
              What Unis keeps after the card fee is Unis&rsquo;s own money, so
              it joins the Community Share pot like the rest of Unis&rsquo;s
              income. Your part never does.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-artist',
        q: 'What is a supported artist?',
        a: (
          <>
            <P>
              The artist who earns from your listening. You choose one when you
              sign up, and you keep one from then on — this is the mechanism that keeps
              money circulating locally instead of pooling at the top.
            </P>
            <P>
              You can switch whenever you like, but the change takes effect at
              the end of the pay period, not immediately. That protects the
              artist you were supporting from losing income they had already
              earned.
            </P>
            <P note>
              If your supported artist leaves Unis, your support ends and you
              pick a new one — it starts right away, with no wait for the end of
              the pay period. Until you do, that share goes to Unis.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-referrer',
        q: 'What if the person who invited me leaves?',
        a: (
          <>
            <P>
              Their own share goes to Unis from then on. It isn&rsquo;t passed
              to anyone else. Everyone else in the chain keeps theirs: the
              people above them still earn their levels from your listening.
            </P>
            <P>
              Your supported artist keeps earning either way. That part of the
              split is never affected by what happens to your referrer.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-getting-paid',
        q: 'How do I actually get paid?',
        a: (
          <>
            <P>
              Through Stripe. Connect a Stripe account from the Earnings page.
              Two kinds of money land there:
            </P>
            <Ul>
              <Li>
                <B>Song sales and support</B> go to your Stripe account the
                moment someone pays.
              </Li>
              <Li>
                <B>Community Share</B> builds up in your Unis balance once a
                month, when a month is closed. Once it reaches <B>$50</B> you can
                withdraw it to your Stripe account; below that it keeps
                accruing.
              </Li>
            </Ul>
            <P>
              Stripe then pays everything in your Stripe account to your bank
              once a month, on the 1st. Unis covers Stripe&rsquo;s payout fees.
            </P>
            <P note>
              A month is closed after Unis has been paid for it. Ad networks pay
              in the second half of the following month, so October&rsquo;s share
              usually lands in late November.
            </P>
            <P>
              You will need a verified phone number for Community Share money
              to reach you at all, so add one before you start building a
              balance.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-taxes',
        q: 'Will I get a tax form?',
        a: (
          <>
            <P>
              If you&rsquo;re paid enough in a year, yes. Unis files them through
              Stripe, as the law requires:
            </P>
            <Ul>
              <Li>
                <B>Community Share money</B> you withdraw: usually a Form
                1099-MISC once it reaches $2,000 in a calendar year.
              </Li>
              <Li>
                <B>Song sales and support</B>: a Form 1099-K once they pass
                $20,000 and 200 payments in a calendar year.
              </Li>
            </Ul>
            <P>
              Stripe collects your tax details (your SSN or EIN) when you set up
              payouts, and may email you to confirm them and to deliver your
              forms electronically early the following year. Some states report
              at lower amounts.
            </P>
            <P note>
              With or without a form, the money is income. Keep your own records,
              and ask a tax professional if you&rsquo;re unsure what you owe.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-plus',
        q: 'How does Unis Plus pay artists?',
        a: (
          <>
            <P>
              Unis Plus is the ad-free plan. Each month, a subscriber&rsquo;s
              $4.99 is shared like this:
            </P>
            <Ul>
              <Li>
                <B>Half to the artist they support</B>, whatever they played:
                $2.50 of every $4.99. Ten supporters on Plus is $25 a month,
                guaranteed.
              </Li>
              <Li>
                <B>Stripe&rsquo;s card and billing fees</B>: about 49&cent;.
              </Li>
              <Li>
                <B>Half of what&rsquo;s left to the artists they played</B>,
                split by their counted plays (the same 50-a-day rule as the
                Community Share; your own songs don&rsquo;t count). That&rsquo;s
                $1.00 on a $4.99 month. Their supported artist gets part of
                this too when they play them.
              </Li>
              <Li>
                <B>The other half to the Community Share</B>: $1.00.
              </Li>
            </Ul>
            <P>
              If a subscriber played nobody that month, the played
              artists&rsquo; half goes to the artist they support too, so
              they get $3.50.
            </P>
            <P>
              It&rsquo;s credited to your Earnings balance when the month is
              closed, shown as &ldquo;Unis Plus&rdquo;, and paid out with the
              rest of your balance. To be paid you need the same things as the
              Community Share: a live account and a verified phone number.
            </P>
          </>
        ),
      },
      {
        id: 'payouts-coming',
        q: 'What about audio ads?',
        a: (
          <>
            <P>
              Audio ads aren&rsquo;t live yet. When they arrive, 60% of the net
              revenue from ads played with your songs goes to you, and
              Unis&rsquo;s 40% joins the Community Share pot.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'plus-ads',
    title: 'Unis Plus, ads and sponsors',
    blurb: 'The ad-free plan, what the ads on Unis are, and how a local business can sponsor Unis.',
    status: 'published',
    articles: [
      {
        id: 'plus-what',
        q: 'What is Unis Plus?',
        a: (
          <>
            <P>
              Unis Plus removes every ad on Unis for your account, on every
              device you sign in on. It&rsquo;s $4.99 a month, paid by card on
              Stripe&rsquo;s secure page. Half of it, $2.50, goes to the artist
              you support, no matter what you play. Of the rest after
              Stripe&rsquo;s fees, $1.00 goes to the artists you play that
              month and $1.00 to the Community Share.
            </P>
            <P>
              Get it from <B>Unis Plus</B> in the menu. It turns on as soon as
              the payment goes through.
            </P>
          </>
        ),
      },
      {
        id: 'plus-cancel',
        q: 'How do I cancel, or change my card?',
        a: (
          <>
            <P>
              Open <B>Unis Plus</B> and press <B>Manage plan</B>. Stripe&rsquo;s
              page lets you change your card, see receipts, or cancel.
            </P>
            <P>
              Canceling stops the next payment. Plus stays on until the end of
              the month you already paid for; there are no refunds for part of a
              month. Deleting your Unis account cancels Plus too.
            </P>
            <P note>
              If a payment fails, Stripe tries your card again over the next few
              days and Plus stays on meanwhile. If it still can&rsquo;t be
              charged, Plus ends and ads come back.
            </P>
          </>
        ),
      },
      {
        id: 'ads-what',
        q: 'What are the ads on Unis?',
        a: (
          <>
            <P>
              Some pages have one ad space, labeled so you always know what it
              is:
            </P>
            <Ul>
              <Li>
                <B>Sponsored &middot; Local</B> &mdash; a Harlem business that
                booked a week with Unis.
              </Li>
              <Li>
                <B>Advertisement</B> &mdash; an ad from Google.
              </Li>
              <Li>
                <B>From Unis</B> &mdash; Unis&rsquo;s own card, when there&rsquo;s
                no ad to show.
              </Li>
            </Ul>
            <P>
              There are no ads in Messages, Earnings, Settings, Help, or while
              you vote. Nobody is paid for seeing or tapping an ad; the money
              Unis makes from ads joins the Community Share pot.
            </P>
          </>
        ),
      },
      {
        id: 'sponsor-how',
        q: 'How can my business sponsor Unis?',
        a: (
          <>
            <P>
              Go to the Sponsor Harlem page (or scan a Unis sponsor QR code).
              Pick Uptown, Downtown or all of Harlem and a week, add your logo,
              one line and a link, and pay by card. One neighborhood is $25 a
              week; all of Harlem is $40.
            </P>
            <P>
              Unis reviews every sponsorship within one business day. If it
              can&rsquo;t run, you get a full refund. It runs from Monday of your
              week, and the day after it ends we email you how many times it was
              shown and tapped.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'deleting',
    title: 'Deleting things',
    blurb: 'What happens to your account, your money, songs and usernames when something is deleted.',
    status: 'published',
    articles: [
      {
        id: 'deleting-account',
        q: 'What happens when I delete my account?',
        a: (
          <>
            <P>
              Your profile comes down, and your songs, videos, photos, likes,
              follows, comments and playlists are removed. Your contact details
              are wiped, so you can come back later with the same email — as a
              new account.
            </P>
            <P>
              Some things stay, because they belong to other people too. Votes
              and plays you already made stay in results decided before you
              left, without your details; they stop counting in any race that
              is still open. Messages you sent stay in the other person&rsquo;s
              inbox. Songs of yours that won awards stay in the winners history.
            </P>
            <P>
              If people support you, their support ends and they pick a new
              artist. If you joined less than 30 days ago, the points your
              sign-up gave others come off: your referrer&rsquo;s bonus and the
              5 points your supported artist got.
            </P>
            <P>
              If you have Unis Plus, it&rsquo;s canceled within the hour, so
              you&rsquo;re never charged again.
            </P>
            <P note>
              There is no undo. Deleting is permanent.
            </P>
          </>
        ),
      },
      {
        id: 'deleting-money',
        q: 'What happens to money I am owed?',
        a: (
          <>
            <P>
              Nothing is lost by accident. While a payout is on its way to your
              bank, you can&rsquo;t delete your account. If you have $50 or more
              waiting, cash it out from Earnings first.
            </P>
            <P>
              A balance under $50 can&rsquo;t be paid out, so deleting your
              account gives it up. Unis shows you the exact amount and asks you
              to confirm before anything happens.
            </P>
            <P>
              Money you earned for other people stays theirs. Shares already
              paid to your supported artist and the people who referred you are
              not taken back.
            </P>
          </>
        ),
      },
      {
        id: 'deleting-song',
        q: 'What happens when a song is removed?',
        a: (
          <>
            <P>
              An artist can remove their own songs, and Unis removes songs for
              copyright takedowns. A removed song leaves the artist&rsquo;s page,
              the charts, every playlist and every open vote straight away.
              Nobody can play, like, comment on, vote for or buy it.
            </P>
            <P>
              It stays in the history. If it won an award, the winners history
              still shows it by title and artist, and a past leaderboard shows
              its race as it stood when it closed. It no longer counts toward
              the artist&rsquo;s trophy count.
            </P>
            <P>
              If it&rsquo;s waiting in your queue, Unis skips it when it gets
              there and takes it out of the queue.
            </P>
            <P note>
              Titles aren&rsquo;t reserved — another song can use the same name,
              and the artist can upload the song again.
            </P>
          </>
        ),
      },
      {
        id: 'deleting-username',
        q: 'Can someone take a username after its owner leaves?',
        a: (
          <>
            <P>
              No. A username belongs to one account forever, including after
              that account is deleted, so nobody can pose as a past winner.
            </P>
            <P>
              Capitalization doesn&rsquo;t make a new name: if
              &ldquo;Kingpin&rdquo; exists, &ldquo;kingpin&rdquo; is taken. Names
              reserved on the waitlist count too.
            </P>
          </>
        ),
      },
    ],
  },
];

export default HELP_SECTIONS;
const s = StyleSheet.create({
  p: { color: 'rgba(255,255,255,0.82)', fontSize: 14.5, lineHeight: 22, marginBottom: 10 },
  b: { color: '#fff', fontWeight: '800' },
  em: { fontStyle: 'italic' },
  a: { fontWeight: '700', textDecorationLine: 'underline' },
  note: { borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.25)', paddingLeft: 12, paddingVertical: 2, marginBottom: 10 },
  noteText: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 20 },
  ul: { marginBottom: 10, gap: 6 },
  li: { flexDirection: 'row', gap: 8 },
  bullet: { color: 'rgba(255,255,255,0.5)', fontSize: 14.5, lineHeight: 22 },
  liText: { color: 'rgba(255,255,255,0.82)', fontSize: 14.5, lineHeight: 22, flex: 1 },
  table: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 12 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, gap: 8 },
  thead: { backgroundColor: 'rgba(255,255,255,0.06)' },
  trDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  th: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  td: { flex: 1, color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 17 },
  tdName: { color: '#fff', fontWeight: '800' },
  tdView: { flex: 1 },
  barCell: { gap: 3 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  juris: { gap: 6, marginBottom: 12 },
  jurisRow: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
  jurisTier: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  jurisNote: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 1 },
  cascade: { gap: 10, marginBottom: 12 },
  cascadeStep: { flexDirection: 'row', gap: 10 },
  cascadeN: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cascadeNText: { fontWeight: '900', fontSize: 12.5 },
});
