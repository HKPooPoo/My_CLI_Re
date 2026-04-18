--
-- PostgreSQL database dump
--

\restrict J7p1z74inKg6JbAB1Xi3U68KvZgBGSYC0rf2jUb4YbgT8An2AgmN5M3fC7d8zNc

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 17.9 (Debian 17.9-0+deb13u1)

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
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


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
30	1	1775744722201	master test0 branch 1	1776332130601	Hello World\n12345678	db93a65ab46e1697d6c0ad97d151948800d55f726321d5ec460646f15047606e	2026-04-16 09:35:33	2026-04-16 09:35:33
32	1	1773488909335	TimeTable	1774496618671	ED Week 1 18/1\n\nED Week 2 25/1\nED Programming Project GP Reg 26/1\n\nWeek 3 1/2\n\nWeek 4 8/2 !\nED Programming Project GP Proposal 8/2\nED Software Engineering GP Reg 15/2\n\nWeek 5 22/2 !\nED Computer Networking Assignment ?\n[text](<Computer Networking/Assignment 1/SEHH2238_A1_2526S2_v2.1_Q.pdf>)\n\nWeek 6 1/3 !\nED Logic and Reasoning Test 5/3\n\nWeek 7 8/3\nED Software Engineering Group Project 6/3\nED Software Engineering Mid-Term 9/3\nED Data Structure Assignment 1 ? 13/3\n[text](<Data Structure/Assignment 1/SEHH2239 Asg1 2526 S2.pdf>)\n[text](<Data Structure/Assignment 1/Assign_1_Template.ipynb>)\nProgramming Project Design 15/3\n\nWeek 8 15/3\nProgramming Project Interim Presentation 17/3\nData Structure Mid-Term Test 18/3\nSoftware Engineering Group Project 21/3\n[text](<Software Engineering/Assignement 1/SEHH3143 Group Project Statement (2025-2026s2).pdf>) \n[text](<Software Engineering/Assignement 1/SEHH3143 Group Project - FAQ.pdf>)\nSoftware Engineering Individual Assignment 22/3\n\nWeek 9 22/3\nComputer Networking Mid-Term Test 23/3\nLogic and Reasoning Mid-Term Test 26/3\n\nWeek 10 29/3\n\nWeek 11 5/4\n\nWeek 12 12/4\nLogic and Reasoning Group Project 16/4 \nComputer Networking Group Project 17/4\nData Structure Assignment 2 17/2\nSoftware Engineering Individual Assignment 18/4\n\n\nWeek 13 19/4\nProgramming Project Presentation 21/4\nProgramming Project Source Code ZIP; PPT; PDF 25/4\nLogic and Reasoning Test ?	\N	2026-04-17 10:59:49	2026-04-17 10:59:49
33	1	1773488909335	TimeTable	1773811479354	Data Structure\n18 March 2026\n18:30 - 19:30\nWK-N1002\n24121627A 33	5c2076dd01451ebc172d3e5382c04f3c7ebf1173895408068017626acba4288e	2026-04-17 10:59:49	2026-04-17 10:59:49
34	1	1774171572361	master Trash	1774331176951	LR	["924e76a7172c782e1fa1e6f48e62542b755a1a432c4a381b626eddaf6250737d","a7a21d48097af2eb90d67f37fc519afba01a4b58cd89d98eb258fedb43d3a476","74aae58753dc972ee6b38d591ac78544e30b70c2309d1e5f073d3af9c5b880a9"]	2026-04-17 10:59:58	2026-04-17 11:00:46
31	1	1774378283770	Logic and Reasoning	1774653231605	A if B\nOnly if A, B\nA provided B\nA given B\nA when B\nA necessary for B\nA implied by B\nA as long as B\nNone but A is B\nA required for B\nWithout A no B\nA whenever B\nThere is A in B\nA unless B\nAll except A are B	["d9d5b54cf15dc1ccba52f99721dd15b4f3513fa3a8373bfdee9b89427e93c0c5","4345bbaf814f358e6e361137a78354b083d4074464fd205d06e35a55d05c7500"]	2026-04-17 10:59:43	2026-04-17 21:24:43
\.


--
-- Data for Name: broadcast_boards; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_boards (id, channel_id, "timestamp", text, file_hash, created_at, updated_at) FROM stdin;
5	1	1776121185927	This is BC 1\nThis is 2nd BC on page 2	\N	2026-04-14 13:28:51	2026-04-14 13:28:51
6	1	1776121150198	This is BC 1\nThis is 1st BC on page 1	\N	2026-04-14 13:28:51	2026-04-14 13:28:51
\.


--
-- Data for Name: broadcast_channels; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_channels (id, name, user_id, last_signal, created_at, updated_at) FROM stdin;
1	testBC1	1	1776173331827	2026-04-13 22:59:56	2026-04-14 13:28:51
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
1	db93a65ab46e1697d6c0ad97d151948800d55f726321d5ec460646f15047606e	1	ml4.xml	text/xml	5381	files/db/93/db93a65ab46e1697d6c0ad97d151948800d55f726321d5ec460646f15047606e.xml	committed	2026-04-16 09:35:32	2026-04-16 09:35:33
3	4345bbaf814f358e6e361137a78354b083d4074464fd205d06e35a55d05c7500	1	17747469594385686924817091551268.jpg	image/jpeg	2563273	files/43/45/4345bbaf814f358e6e361137a78354b083d4074464fd205d06e35a55d05c7500.jpg	committed	2026-04-17 10:59:43	2026-04-17 10:59:43
4	5c2076dd01451ebc172d3e5382c04f3c7ebf1173895408068017626acba4288e	1	blob	image/jpeg	85490	files/5c/20/5c2076dd01451ebc172d3e5382c04f3c7ebf1173895408068017626acba4288e.bin	committed	2026-04-17 10:59:49	2026-04-17 10:59:49
5	924e76a7172c782e1fa1e6f48e62542b755a1a432c4a381b626eddaf6250737d	1	P_20260324_134516.jpg	image/jpeg	2597576	files/92/4e/924e76a7172c782e1fa1e6f48e62542b755a1a432c4a381b626eddaf6250737d.jpg	committed	2026-04-17 10:59:57	2026-04-17 10:59:58
6	a7a21d48097af2eb90d67f37fc519afba01a4b58cd89d98eb258fedb43d3a476	1	P_20260324_134505.jpg	image/jpeg	2808401	files/a7/a2/a7a21d48097af2eb90d67f37fc519afba01a4b58cd89d98eb258fedb43d3a476.jpg	committed	2026-04-17 10:59:58	2026-04-17 10:59:58
7	74aae58753dc972ee6b38d591ac78544e30b70c2309d1e5f073d3af9c5b880a9	1	17764236172214115021107765902272.jpg	image/jpeg	3489863	files/74/aa/74aae58753dc972ee6b38d591ac78544e30b70c2309d1e5f073d3af9c5b880a9.jpg	committed	2026-04-17 11:00:46	2026-04-17 11:00:46
8	d9d5b54cf15dc1ccba52f99721dd15b4f3513fa3a8373bfdee9b89427e93c0c5	1	Venn.jpg	image/jpeg	2342892	files/d9/d5/d9d5b54cf15dc1ccba52f99721dd15b4f3513fa3a8373bfdee9b89427e93c0c5.jpg	committed	2026-04-17 21:24:43	2026-04-17 21:24:43
2	3bd0137f06229cbfda296a74c5f4aeb8532693590857842e8198db6513562fba	1	17746532087283096195777657826607.jpg	image/jpeg	2342892	files/3b/d0/3bd0137f06229cbfda296a74c5f4aeb8532693590857842e8198db6513562fba.jpg	orphaned	2026-04-17 10:59:41	2026-04-17 22:00:00
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
2	test1	$2y$12$aJL.lWuY0JdhEY8UnyqfCujWRsqjAGCOq968dk/p5exBZrqbeWPUa	\N	\N	\N	2026-04-09 14:25:53	2026-04-09 14:25:53	\N
1	test0	$2y$12$FdEvLbBRRsJ0BORVBYEQ8u50.uNkqyCOZru7j3oIwUjmp6VAkf9Eu	testTitle	\N	\N	2026-04-09 14:25:34	2026-04-09 14:25:34	\N
\.


--
-- Data for Name: walkie_typie_boards; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.walkie_typie_boards (id, user_id, branch_id, branch_name, "timestamp", text, file_hash, created_at, updated_at) FROM stdin;
16	1	wt_1_2	WE	1776120341331	Hello? World	\N	2026-04-13 22:45:42	2026-04-13 22:45:42
4	1	wt_1_2	WE	1776120302461	This is page 2	\N	2026-04-13 22:45:03	2026-04-13 22:45:42
\.


--
-- Data for Name: walkie_typie_connections; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.walkie_typie_connections (id, user_id, partner_id, partner_tag, my_branch_id, partner_branch_id, last_signal, created_at, updated_at) FROM stdin;
1	1	2	test 1 guy	wt_1_2	wt_2_1	1776120342209	2026-04-13 19:00:39	2026-04-13 22:45:42
2	2	1	\N	wt_2_1	wt_1_2	1776120342209	2026-04-13 19:00:39	2026-04-13 22:45:42
\.


--
-- Name: blackboards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.blackboards_id_seq', 36, true);


--
-- Name: broadcast_boards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_boards_id_seq', 6, true);


--
-- Name: broadcast_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_channels_id_seq', 1, true);


--
-- Name: broadcast_pins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_pins_id_seq', 1, false);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.files_id_seq', 8, true);


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.migrations_id_seq', 11, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- Name: walkie_typie_boards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.walkie_typie_boards_id_seq', 17, true);


--
-- Name: walkie_typie_connections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.walkie_typie_connections_id_seq', 2, true);


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
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: yu
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


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

\unrestrict J7p1z74inKg6JbAB1Xi3U68KvZgBGSYC0rf2jUb4YbgT8An2AgmN5M3fC7d8zNc

