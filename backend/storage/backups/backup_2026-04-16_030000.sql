--
-- PostgreSQL database dump
--

\restrict fl3hrIdW371XX7Rddb42RFh5bOG78rWumN9Ul0Xy8BY6K0t98M7ghRJSYujBOlE

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
23	1	1775744722201	master test0 branch 1	1776255763552	Hello World\n1234567	\N	2026-04-15 12:22:45	2026-04-15 13:07:58
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

SELECT pg_catalog.setval('public.blackboards_id_seq', 29, true);


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

SELECT pg_catalog.setval('public.files_id_seq', 1, false);


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

\unrestrict fl3hrIdW371XX7Rddb42RFh5bOG78rWumN9Ul0Xy8BY6K0t98M7ghRJSYujBOlE

