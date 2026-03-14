--
-- PostgreSQL database dump
--

\restrict W7wZ0wLIWGSfCbjTtUVnSdKQ7M1okTBFm2QeMRtWKgs7FjfZyigV9ftKprmDWl2

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 17.8 (Debian 17.8-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: blackboards; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.blackboards (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    branch_id character varying(255) NOT NULL,
    branch_name character varying(255),
    "timestamp" bigint NOT NULL,
    text text,
    file_hash text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.blackboards OWNER TO yu;

--
-- Name: blackboards_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.blackboards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.blackboards_id_seq OWNER TO yu;

--
-- Name: blackboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.blackboards_id_seq OWNED BY public.blackboards.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.branches (
    id bigint NOT NULL,
    code character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.branches OWNER TO yu;

--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.branches_id_seq OWNER TO yu;

--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: broadcast_boards; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.broadcast_boards (
    id bigint NOT NULL,
    channel_id bigint NOT NULL,
    "timestamp" bigint NOT NULL,
    text text,
    file_hash text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.broadcast_boards OWNER TO yu;

--
-- Name: broadcast_boards_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.broadcast_boards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.broadcast_boards_id_seq OWNER TO yu;

--
-- Name: broadcast_boards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.broadcast_boards_id_seq OWNED BY public.broadcast_boards.id;


--
-- Name: broadcast_channels; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.broadcast_channels (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    user_id bigint NOT NULL,
    last_signal bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.broadcast_channels OWNER TO yu;

--
-- Name: broadcast_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.broadcast_channels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.broadcast_channels_id_seq OWNER TO yu;

--
-- Name: broadcast_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.broadcast_channels_id_seq OWNED BY public.broadcast_channels.id;


--
-- Name: broadcast_pins; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.broadcast_pins (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.broadcast_pins OWNER TO yu;

--
-- Name: broadcast_pins_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.broadcast_pins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.broadcast_pins_id_seq OWNER TO yu;

--
-- Name: broadcast_pins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.broadcast_pins_id_seq OWNED BY public.broadcast_pins.id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.files (
    id bigint NOT NULL,
    hash character varying(64) NOT NULL,
    user_id bigint,
    original_name character varying(255) NOT NULL,
    mime_type character varying(255) NOT NULL,
    size bigint NOT NULL,
    disk_path character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'staged'::character varying NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.files OWNER TO yu;

--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.files_id_seq OWNER TO yu;

--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.menu_items (
    id bigint NOT NULL,
    category jsonb NOT NULL,
    name jsonb NOT NULL,
    price integer NOT NULL,
    image character varying(255),
    options_schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    timeslots jsonb DEFAULT '["all"]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    available boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.menu_items OWNER TO yu;

--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.menu_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_items_id_seq OWNER TO yu;

--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    migration character varying(255) NOT NULL,
    batch integer NOT NULL
);


ALTER TABLE public.migrations OWNER TO yu;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO yu;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    menu_item_id bigint,
    name character varying(255) NOT NULL,
    base_price integer NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    subtotal integer NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.order_items OWNER TO yu;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO yu;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    order_number character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'preparing'::character varying NOT NULL,
    total integer NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    branch_id bigint,
    table_number integer,
    session_token character varying(255)
);


ALTER TABLE public.orders OWNER TO yu;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO yu;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: restaurant_sessions; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.restaurant_sessions (
    id bigint NOT NULL,
    branch_id bigint NOT NULL,
    table_number integer NOT NULL,
    token character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL
);


ALTER TABLE public.restaurant_sessions OWNER TO yu;

--
-- Name: restaurant_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.restaurant_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.restaurant_sessions_id_seq OWNER TO yu;

--
-- Name: restaurant_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.restaurant_sessions_id_seq OWNED BY public.restaurant_sessions.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.sessions (
    id character varying(255) NOT NULL,
    user_id bigint,
    ip_address character varying(45),
    user_agent text,
    payload text NOT NULL,
    last_activity integer NOT NULL
);


ALTER TABLE public.sessions OWNER TO yu;

--
-- Name: users; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    uid character varying(255) NOT NULL,
    passcode character varying(255) NOT NULL,
    title character varying(255),
    email character varying(255),
    remember_token character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    settings jsonb
);


ALTER TABLE public.users OWNER TO yu;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO yu;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: walkie_typie_boards; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.walkie_typie_boards (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    branch_id character varying(255) NOT NULL,
    branch_name character varying(255),
    "timestamp" bigint NOT NULL,
    text text,
    file_hash text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.walkie_typie_boards OWNER TO yu;

--
-- Name: walkie_typie_boards_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.walkie_typie_boards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.walkie_typie_boards_id_seq OWNER TO yu;

--
-- Name: walkie_typie_boards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.walkie_typie_boards_id_seq OWNED BY public.walkie_typie_boards.id;


--
-- Name: walkie_typie_connections; Type: TABLE; Schema: public; Owner: yu
--

CREATE TABLE public.walkie_typie_connections (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    partner_id bigint NOT NULL,
    partner_tag character varying(255),
    my_branch_id character varying(255) NOT NULL,
    partner_branch_id character varying(255) NOT NULL,
    last_signal bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE public.walkie_typie_connections OWNER TO yu;

--
-- Name: walkie_typie_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: yu
--

CREATE SEQUENCE public.walkie_typie_connections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.walkie_typie_connections_id_seq OWNER TO yu;

--
-- Name: walkie_typie_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: yu
--

ALTER SEQUENCE public.walkie_typie_connections_id_seq OWNED BY public.walkie_typie_connections.id;


--
-- Name: blackboards id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.blackboards ALTER COLUMN id SET DEFAULT nextval('public.blackboards_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: broadcast_boards id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_boards ALTER COLUMN id SET DEFAULT nextval('public.broadcast_boards_id_seq'::regclass);


--
-- Name: broadcast_channels id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_channels ALTER COLUMN id SET DEFAULT nextval('public.broadcast_channels_id_seq'::regclass);


--
-- Name: broadcast_pins id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_pins ALTER COLUMN id SET DEFAULT nextval('public.broadcast_pins_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: restaurant_sessions id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.restaurant_sessions ALTER COLUMN id SET DEFAULT nextval('public.restaurant_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: walkie_typie_boards id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_boards ALTER COLUMN id SET DEFAULT nextval('public.walkie_typie_boards_id_seq'::regclass);


--
-- Name: walkie_typie_connections id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_connections ALTER COLUMN id SET DEFAULT nextval('public.walkie_typie_connections_id_seq'::regclass);


--
-- Data for Name: blackboards; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.blackboards (id, user_id, branch_id, branch_name, "timestamp", text, file_hash, created_at, updated_at) FROM stdin;
674	3	1773243546538	test0 master	1773416533572	The File UP; The script:\n\n>>PAGE 2\n\n>>PAGE 3\nI am developing a website that implements note-taking-related fundamentals with a mod system, which allows different users to customize the usage based on their needs.\n\nThe fundamentals can be split into three parts:\nBlackboard, which is for note-taking;\n\n>>PAGE 4\nWalkie-Typie, which is for one-to-one chat;\n\nAnd Broadcast, which is for one-to-many conversation.\n\n>>Page 5\nHere are the insights...\nBTW, the project name is called MyCLI, and I know the word "Logging" is controversial, so I've explained it on Page 5, here.\n\n>>PAGE 6\nNow, the note-taking app is saturated, so why am I gonna make this?\n\nFirst off, the replacement objective is the "message yourself" in WhatsApp. Which is the first place where I will take notes to remember myself, stuff like schedules or some insights? In most cases, it works, but eventually becomes a mess, because most of them are junk messages, and it is useless when offline, which are things this project is gonna resolve.\n\n>>PAGE 7\nSecondly, I want to have a place to easily partition the contexts, without manually organizing them, while keeping the operation simple.\n\nMoreover, I want it to be highly customizable, so that every user can customize their UX.\n\nSo, let's move on to the plan.\n\n>>PAGE 8\nLet's jump to the... system design.\n\n>>PAGE 15\nHere, is the design reference of the UI layout.\n\n>>PAGE 16\nIt actually looks like this.\n\nSee, this is the entrance page AND the note jotting area, which allows agile jotting.\n\nBut before explaining what these mean, let me explain the concept of Blackboard by analogy.\n\n>>PAGE 3\nSo, this is literally the blackboard in Harvard, which is composed of multiple blackboards. \nEach blackboard can be pushed up and down.\n\n>>PAGE 17\nHere is the thing: \nFirst, each blackboard is sectionized on a long scroll, and each time you can only look at one section.\nSecondly, each section is followed by a timestamp, which is the reference for ordering. The largest timestamp is on the top, and vice versa.\nThirdly, whenever the section reaches the threshold, it will be destroyed.\nLastly, the pointer, which indicates your viewpoint, is called HEAD.\nNow, when we PUSH Up, the pointer goes up.\nWhen we PULL Down, the pointer goes down, until reaching the bottom.\nIF the pointer peaked AND we PUSHED, a blank blackboard is created.\n\n>>PAGE 16\nAnd that's basically the superficial mechanism.\n\nLet me explain what it resolved.\nFirst, the sectionized design helps categorize content.\nSecondly, it minimized the operation complexity, steps, and time cost.	["fd0b1c12844bc02c9a2913d1a74459619fe6e8061efe44cc8a46de7143d5160c","6305e02aab752972b2e46b1c49f4856f30718a81c0d056289dbddd428ead9802"]	2026-03-13 15:42:18	2026-03-14 02:37:59
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.branches (id, code, name, created_at, updated_at) FROM stdin;
1	TM	Tuen Mun	2026-03-12 02:26:54	2026-03-12 02:26:54
2	TSW	Tin Shui Wai	2026-03-12 02:26:54	2026-03-12 02:26:54
\.


--
-- Data for Name: broadcast_boards; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_boards (id, channel_id, "timestamp", text, file_hash, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: broadcast_channels; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_channels (id, name, user_id, last_signal, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: broadcast_pins; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_pins (id, user_id, channel_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.files (id, hash, user_id, original_name, mime_type, size, disk_path, status, created_at, updated_at) FROM stdin;
1	fd0b1c12844bc02c9a2913d1a74459619fe6e8061efe44cc8a46de7143d5160c	3	Group_8_Design.pdf	application/pdf	2127433	files/fd/0b/fd0b1c12844bc02c9a2913d1a74459619fe6e8061efe44cc8a46de7143d5160c.pdf	committed	2026-03-13 09:13:01	2026-03-13 09:13:01
2	6305e02aab752972b2e46b1c49f4856f30718a81c0d056289dbddd428ead9802	3	image.png	image/png	510453	files/63/05/6305e02aab752972b2e46b1c49f4856f30718a81c0d056289dbddd428ead9802.png	committed	2026-03-13 12:03:02	2026-03-13 12:03:03
3	dfd0c3ff0bed75ff9d470271bbb2f0073719094e6a1644184595563cb6fe2a75	3	image.png	image/png	407963	files/df/d0/dfd0c3ff0bed75ff9d470271bbb2f0073719094e6a1644184595563cb6fe2a75.png	orphaned	2026-03-13 14:00:07	2026-03-13 14:00:15
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.menu_items (id, category, name, price, image, options_schema, timeslots, sort_order, available, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.migrations (id, migration, batch) FROM stdin;
1	0001_01_01_000000_create_users_table	1
2	2026_02_14_012535_create_blackboards_table	1
3	2026_02_16_015846_create_walkie_typie_connections_table	1
4	2026_02_17_095800_create_walkie_typie_boards_table	1
5	2026_02_18_050000_create_files_table	1
6	2026_02_21_000001_create_broadcast_channels_table	1
7	2026_02_21_000002_create_broadcast_boards_table	1
8	2026_02_21_000003_create_broadcast_pins_table	1
9	2026_02_24_153557_alter_file_hash_to_text_on_board_tables	1
10	2026_02_25_000001_add_settings_to_users_table	1
11	2026_02_28_000001_add_performance_indexes	1
12	2026_03_06_192814_create_restaurant_tables	2
13	2026_03_07_000001_add_branches_sessions_to_restaurant	2
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.order_items (id, order_id, menu_item_id, name, base_price, qty, options, subtotal, created_at, updated_at) FROM stdin;
1	1	\N	Test Rice	42	1	[]	42	2026-03-12 02:27:29	2026-03-12 02:27:29
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.orders (id, order_number, status, total, created_at, updated_at, branch_id, table_number, session_token) FROM stdin;
1	TM001	preparing	42	2026-03-12 02:27:29	2026-03-12 02:27:29	1	5	Dy3EWP8yA9op39XT8EHGCwInTUaPk0mT
\.


--
-- Data for Name: restaurant_sessions; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.restaurant_sessions (id, branch_id, table_number, token, status, created_at, expires_at) FROM stdin;
1	1	5	Dy3EWP8yA9op39XT8EHGCwInTUaPk0mT	closed	2026-03-12 02:27:02	2026-03-12 03:27:02
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.sessions (id, user_id, ip_address, user_agent, payload, last_activity) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.users (id, uid, passcode, title, email, remember_token, created_at, updated_at, settings) FROM stdin;
3	test0	$2y$12$7nmcqZWrJwktrX.S/AEfsuTTF.QapY8lqxYkPMLOaUAHgh2moELUW	test title	\N	\N	2026-03-11 15:55:31	2026-03-11 15:55:31	\N
\.


--
-- Data for Name: walkie_typie_boards; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.walkie_typie_boards (id, user_id, branch_id, branch_name, "timestamp", text, file_hash, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: walkie_typie_connections; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.walkie_typie_connections (id, user_id, partner_id, partner_tag, my_branch_id, partner_branch_id, last_signal, created_at, updated_at) FROM stdin;
\.


--
-- Name: blackboards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.blackboards_id_seq', 678, true);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.branches_id_seq', 2, true);


--
-- Name: broadcast_boards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_boards_id_seq', 1, false);


--
-- Name: broadcast_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_channels_id_seq', 1, false);


--
-- Name: broadcast_pins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_pins_id_seq', 1, false);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.files_id_seq', 3, true);


--
-- Name: menu_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.menu_items_id_seq', 1, false);


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.migrations_id_seq', 13, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.order_items_id_seq', 1, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, true);


--
-- Name: restaurant_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.restaurant_sessions_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: walkie_typie_boards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.walkie_typie_boards_id_seq', 1, false);


--
-- Name: walkie_typie_connections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.walkie_typie_connections_id_seq', 1, false);


--
-- Name: blackboards blackboards_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.blackboards
    ADD CONSTRAINT blackboards_pkey PRIMARY KEY (id);


--
-- Name: blackboards blackboards_user_id_branch_id_timestamp_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.blackboards
    ADD CONSTRAINT blackboards_user_id_branch_id_timestamp_unique UNIQUE (user_id, branch_id, "timestamp");


--
-- Name: branches branches_code_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_code_unique UNIQUE (code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: broadcast_boards broadcast_boards_channel_id_timestamp_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_boards
    ADD CONSTRAINT broadcast_boards_channel_id_timestamp_unique UNIQUE (channel_id, "timestamp");


--
-- Name: broadcast_boards broadcast_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_boards
    ADD CONSTRAINT broadcast_boards_pkey PRIMARY KEY (id);


--
-- Name: broadcast_channels broadcast_channels_name_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_channels
    ADD CONSTRAINT broadcast_channels_name_unique UNIQUE (name);


--
-- Name: broadcast_channels broadcast_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_channels
    ADD CONSTRAINT broadcast_channels_pkey PRIMARY KEY (id);


--
-- Name: broadcast_pins broadcast_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_pins
    ADD CONSTRAINT broadcast_pins_pkey PRIMARY KEY (id);


--
-- Name: broadcast_pins broadcast_pins_user_id_channel_id_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_pins
    ADD CONSTRAINT broadcast_pins_user_id_channel_id_unique UNIQUE (user_id, channel_id);


--
-- Name: files files_hash_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_hash_unique UNIQUE (hash);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: restaurant_sessions restaurant_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.restaurant_sessions
    ADD CONSTRAINT restaurant_sessions_pkey PRIMARY KEY (id);


--
-- Name: restaurant_sessions restaurant_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.restaurant_sessions
    ADD CONSTRAINT restaurant_sessions_token_unique UNIQUE (token);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_uid_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_uid_unique UNIQUE (uid);


--
-- Name: walkie_typie_boards walkie_typie_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_boards
    ADD CONSTRAINT walkie_typie_boards_pkey PRIMARY KEY (id);


--
-- Name: walkie_typie_boards walkie_typie_boards_user_id_branch_id_timestamp_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_boards
    ADD CONSTRAINT walkie_typie_boards_user_id_branch_id_timestamp_unique UNIQUE (user_id, branch_id, "timestamp");


--
-- Name: walkie_typie_connections walkie_typie_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_connections
    ADD CONSTRAINT walkie_typie_connections_pkey PRIMARY KEY (id);


--
-- Name: walkie_typie_connections walkie_typie_connections_user_id_partner_id_unique; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_connections
    ADD CONSTRAINT walkie_typie_connections_user_id_partner_id_unique UNIQUE (user_id, partner_id);


--
-- Name: blackboards_branch_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX blackboards_branch_id_index ON public.blackboards USING btree (branch_id);


--
-- Name: blackboards_timestamp_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX blackboards_timestamp_index ON public.blackboards USING btree ("timestamp");


--
-- Name: broadcast_boards_channel_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX broadcast_boards_channel_id_index ON public.broadcast_boards USING btree (channel_id);


--
-- Name: broadcast_boards_timestamp_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX broadcast_boards_timestamp_index ON public.broadcast_boards USING btree ("timestamp");


--
-- Name: broadcast_channels_last_signal_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX broadcast_channels_last_signal_index ON public.broadcast_channels USING btree (last_signal);


--
-- Name: broadcast_channels_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX broadcast_channels_user_id_index ON public.broadcast_channels USING btree (user_id);


--
-- Name: broadcast_pins_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX broadcast_pins_user_id_index ON public.broadcast_pins USING btree (user_id);


--
-- Name: files_status_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX files_status_index ON public.files USING btree (status);


--
-- Name: files_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX files_user_id_index ON public.files USING btree (user_id);


--
-- Name: sessions_last_activity_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX sessions_last_activity_index ON public.sessions USING btree (last_activity);


--
-- Name: sessions_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);


--
-- Name: walkie_typie_boards_branch_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX walkie_typie_boards_branch_id_index ON public.walkie_typie_boards USING btree (branch_id);


--
-- Name: walkie_typie_boards_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX walkie_typie_boards_user_id_index ON public.walkie_typie_boards USING btree (user_id);


--
-- Name: walkie_typie_connections_partner_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX walkie_typie_connections_partner_id_index ON public.walkie_typie_connections USING btree (partner_id);


--
-- Name: walkie_typie_connections_user_id_index; Type: INDEX; Schema: public; Owner: yu
--

CREATE INDEX walkie_typie_connections_user_id_index ON public.walkie_typie_connections USING btree (user_id);


--
-- Name: blackboards blackboards_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.blackboards
    ADD CONSTRAINT blackboards_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: broadcast_boards broadcast_boards_channel_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_boards
    ADD CONSTRAINT broadcast_boards_channel_id_foreign FOREIGN KEY (channel_id) REFERENCES public.broadcast_channels(id) ON DELETE CASCADE;


--
-- Name: broadcast_channels broadcast_channels_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_channels
    ADD CONSTRAINT broadcast_channels_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: broadcast_pins broadcast_pins_channel_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_pins
    ADD CONSTRAINT broadcast_pins_channel_id_foreign FOREIGN KEY (channel_id) REFERENCES public.broadcast_channels(id) ON DELETE CASCADE;


--
-- Name: broadcast_pins broadcast_pins_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.broadcast_pins
    ADD CONSTRAINT broadcast_pins_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: files files_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_menu_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_foreign FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_foreign FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_foreign FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: restaurant_sessions restaurant_sessions_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.restaurant_sessions
    ADD CONSTRAINT restaurant_sessions_branch_id_foreign FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: walkie_typie_boards walkie_typie_boards_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_boards
    ADD CONSTRAINT walkie_typie_boards_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: walkie_typie_connections walkie_typie_connections_partner_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_connections
    ADD CONSTRAINT walkie_typie_connections_partner_id_foreign FOREIGN KEY (partner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: walkie_typie_connections walkie_typie_connections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.walkie_typie_connections
    ADD CONSTRAINT walkie_typie_connections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict W7wZ0wLIWGSfCbjTtUVnSdKQ7M1okTBFm2QeMRtWKgs7FjfZyigV9ftKprmDWl2

