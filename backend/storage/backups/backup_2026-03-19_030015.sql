--
-- PostgreSQL database dump
--

\restrict 7IKDkIRhQAmxo9yhyXYQUjabVJrLDPuYLP4otw5okHGClBQXaGDEXzGbRJmqkW9

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
857	3	1773488909335	test0 TimeTable	1773811163609	ED Week 1 18/1\n\nED Week 2 25/1\nED Programming Project GP Reg 26/1\n\nWeek 3 1/2\n\nWeek 4 8/2 !\nED Programming Project GP Proposal 8/2\nED Software Engineering GP Reg 15/2\n\nWeek 5 22/2 !\nED Computer Networking Assignment ?\n[text](<Computer Networking/Assignment 1/SEHH2238_A1_2526S2_v2.1_Q.pdf>)\n\nWeek 6 1/3 !\nED Logic and Reasoning Test 5/3\n\nWeek 7 8/3\nED Software Engineering Group Project 6/3\nED Software Engineering Mid-Term 9/3\nED Data Structure Assignment 1 ? 13/3\n[text](<Data Structure/Assignment 1/SEHH2239 Asg1 2526 S2.pdf>)\n[text](<Data Structure/Assignment 1/Assign_1_Template.ipynb>)\nProgramming Project Design 15/3\n\nWeek 8 15/3\nProgramming Project Interim Presentation 17/3\nData Structure Mid-Term Test 18/3\nSoftware Engineering Group Project 21/3\n[text](<Software Engineering/Assignement 1/SEHH3143 Group Project Statement (2025-2026s2).pdf>) \n[text](<Software Engineering/Assignement 1/SEHH3143 Group Project - FAQ.pdf>)\nSoftware Engineering Individual Assignment 22/3\n\nWeek 9 22/3\nComputer Networking Mid-Term Test 23/3\nLogic and Reasoning Mid-Term Test 26/3\n\nWeek 10 29/3\n\nWeek 11 5/4\n\nWeek 12 12/4\nComputer Networking Group Project ?\nData Structure Assignment 1 ?\nLogic and Reasoning Group Project 16/4 \n\nWeek 13 19/4\nProgramming Project Source Code ZIP; PPT; PDF 25/4\nLogic and Reasoning Test ?	\N	2026-03-18 05:24:43	2026-03-18 05:24:43
700	3	1773243546538	test0 master	1773560019950	The File UP; The script:\n\n>>PAGE 2\n\n>>PAGE 3\nI am developing a website that implements note-taking-related fundamentals with a mod system, which allows different users to customize the UX based on their needs.\n\nThe fundamentals can be split into three parts:\nBlackboard, which is for self note-taking;\n\n>>PAGE 4\nWalkie-Typie, which is for one-to-one chat;\n\nAnd Broadcast, which is for one-to-many conversation.\n\n>>Page 5\nHere are the insights...\nBTW, the project name is called MyCLI, and I know the word "Logging" is controversial, so I've explained it on Page 5, here.\n\n>>PAGE 6\nNow, the note-taking app is saturated, so why am I gonna make this?\n\nFirst off, the replacement objective is the "message yourself" in WhatsApp. Which is the first place where I will take notes like schedules or some insights to remember myself, In most cases, it works, but eventually becomes a mess, because most of them are junk messages, and it is useless when offline, which are things this project is gonna resolve.\n\n>>PAGE 7\nSecondly, I want to have a place to easily partition the contexts, without manually organizing them, while compacting the steps of operations.\n\nMoreover, I want it to be highly customizable, so that every user can customize their UX.\n\nSo, let's move on to the plan.\n\n>>PAGE 8\nLet's jump to the... system design.\n\n>>PAGE 15\nHere, is the design reference of the UI layout.\n\n>>PAGE 16\nIt actually looks like this.\n\nSee, this is the entrance page AND the note jotting area named Blackboard.\n\nBut before explaining what these mean, let me explain the concept of Blackboard by analogy.\n\n>>PAGE 3\nSo, this is literally the blackboard in Harvard, which is composed of multiple blackboards. \nEach blackboard can be pushed up and down.\n\n>>PAGE 17\nHere is the thing: \nFirst, imagine each blackboard is sectionized on a long scroll, and each time you can only look at one section.\nSecondly, each section is followed by a timestamp, which for ordering reference. The larger timestamp goes higher, and vice versa.\nThirdly, whenever the section reaches the bottom threshold, it will be destroyed.\nLastly, the pointer "HEAD", which indicates your viewpoint.\nNow, when we PUSH Up, the pointer goes up.\nWhen we PULL Down, the pointer goes down, until reaching the bottom.\nIF the pointer peaked AND we PUSHED, a blank blackboard is created.\n\n>>PAGE 16\nAnd that's basically the superficial mechanism.\n\nLet me explain what Blackboard resolved.\nFirst, the sectionized design helps categorize content, making it neater.\nSecondly, it minimized the operation complexity, steps, and time cost.\nAnd lastly, it is capable of offline.\n\nThat's one of the core components of this project.\n\nThere are around nine components in total, but I have no time to discuss them all.\n\nSo let's jump to the system architecture.\n\n>>PAGE 27\nThe client-side is built with HTML, CSS, and JavaScript. It is a Single Page WebApp, using IndexedDB as the client database to fulfill the local-first principle, with higher capacity than localStorage.\n\nFor real-time features like Walkie-Typie, the client uses WebSocket to stream data.\n\n>>page 28\nThe server-side is containerized using Docker to avoid the "it works on my machine" problem.\nThese are the images I have used:\nFirstly, Cloudflare service for network tunneling\nSecondly, Nginx as a gateway\nThirdly, Laravel for the server framework\nFourth, Redis for data caching\nAnd lastly, Postgres for the server database.\n\n>>Q&A	3e99082f62f95cfcde4a351524ddfc27b7821d3fb8ead62bf552c0bad9208069	2026-03-15 07:33:43	2026-03-17 05:27:28
854	3	1773243546538	test0 master	1773725255785	>> Page 1\n\nI am YU Shing Hei from group 8D\n\n>> Page 2\n\nIt is a 30-page presentation in 5 minutes, so I will keep it brief.\n\n>> Page 6\n\nBefore this project, I used the "message yourself" a lot in WhatsApp to jot notes and sync data, because it is simple and fast. But it has many limitations, like no organization, no offline, and not customizable.\n\n>> Page 3\n\nSo I am making a web app that inherits the advantages from "messgae yourself" with some improvements.\n\nI want to make it capable of self-use, communication, and news announcements, represented in these three features.\n\nFirstly, the Blackboard, where users can easily record text or files.\n\n>> Page 4\n\nSecondly, the Walkie-Typie, where users can transmit data.\n\nAnd lastly, the Broadcast, where authorized users can publish news to all users.\n\n>> Page 5\n\nThese are insights and the justification for the project. Especially the word "logging" for the project name.\n\n>> Page 8\n\nThese are the use cases. And there are three levels of users.\n\n>> Page 9\n\nThe guest can only use client features, as shown.\n\n>> Page 10\n\nThe logged-in users can use the server services.\n\nLastly, the titled users, eho are authorised from backend, can publish public news.\n\n>> Page 11\n\nThese are the functional and non-functional requirements\n\n>> Page 14\n\nAround 40 for each, please read pages eleven to fourteen for details.\n\nLet's get to the design.\n\n>> Page 15\n\nI chose the CRT as the design tone because it natively emphasises the content.\n\n>> Page 16\n\nThis is the Blackboard page\nAnd, this is the entrance where you can start jotting things right away.\n\nNow, before explaining the operation logic, let's use some analogies.\n\n>> Page 3\nSo, this is literally the blackboard in Harvard, which is composed of multiple blackboards. \nEach blackboard can be pushed up and down.\n\n>> Page 17\nHere is the thing: \n\nFirst, imagine each blackboard is sectionized on a long scroll, and each time you can only look at one section.\n\nSecondly, each section has a timestamp for ordering. The larger timestamp goes higher, and vice versa.\n\nThirdly, whenever the section reaches the threshold at the bottom, it will be destroyed for auto-cleaning.\n\nLastly, there is a pointer, I call it the Head, that will indicate your viewpoint.\n\nNow, when we PUSH Up, the pointer goes up.\n\nWhen we PULL Down, the pointer goes down until reaching the bottom.\n\nIF the pointer peaked AND we PUSHED, a blank blackboard is created, which I called virtual page.\n\n>> Page 16\n\nAnd that's basically the superficial mechanism shared by all components.\n\nBut there is one more thing\n\n>> Page 22\n\nThe mod system. It is a video game term, just take it as plugins, that makes the customizable UX possible. \n\nFor example, a timer or calculator for aid.\n\nOr using AI to translate, conclude, or polish the content, even when offline.\n\nIt is currently more than 10 toolkits available officially.\n\n>> Page 23\n\nLet's jump to architectural design.\n\nYou can read the ERD on pages twenty-three and twenty-four; also, the test plan on pages twenty-five and twenty-six\n\n>>PAGE 27\n\nThe client-side is built with HTML, CSS, and JavaScript. \n\nIt is a single-page web app, using IndexedDB as the client database to fulfill the local-first principle, with higher capacity than localStorage.\n\nFor real-time features like Walkie-Typie, the client uses WebSocket to stream data.\n\n>>page 28\nThe server-side is containerized using Docker to avoid the "it works on my machine" problem.\n\nThese are the images I have used:\n\nFirstly, Cloudflare service for network tunneling\n\nSecondly, Nginx as a gateway\n\nThirdly, Laravel for the server framework\n\nFourth, Redis for data caching\n\nAnd lastly, Postgres for the server database.\n\n>>Q&A	3e99082f62f95cfcde4a351524ddfc27b7821d3fb8ead62bf552c0bad9208069	2026-03-17 05:27:28	2026-03-17 05:27:28
856	3	1773488909335	test0 TimeTable	1773811479354	Data Structure\n18 March 2026\n18:30 - 19:30\nWK-N1002\n24121627A 33	\N	2026-03-18 05:24:43	2026-03-18 05:24:43
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
3	1	1773691104981	The Design report	3e99082f62f95cfcde4a351524ddfc27b7821d3fb8ead62bf552c0bad9208069	2026-03-16 20:02:08	2026-03-16 20:02:08
\.


--
-- Data for Name: broadcast_channels; Type: TABLE DATA; Schema: public; Owner: yu
--

COPY public.broadcast_channels (id, name, user_id, last_signal, created_at, updated_at) FROM stdin;
1	test0 channel	3	1773691328113	2026-03-16 19:59:02	2026-03-16 20:02:08
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
4	3e99082f62f95cfcde4a351524ddfc27b7821d3fb8ead62bf552c0bad9208069	3	Group_8D_Design.pdf	application/pdf	2178044	files/3e/99/3e99082f62f95cfcde4a351524ddfc27b7821d3fb8ead62bf552c0bad9208069.pdf	committed	2026-03-15 07:30:02	2026-03-15 07:30:04
1	fd0b1c12844bc02c9a2913d1a74459619fe6e8061efe44cc8a46de7143d5160c	3	Group_8_Design.pdf	application/pdf	2127433	files/fd/0b/fd0b1c12844bc02c9a2913d1a74459619fe6e8061efe44cc8a46de7143d5160c.pdf	orphaned	2026-03-13 09:13:01	2026-03-18 06:00:11
2	6305e02aab752972b2e46b1c49f4856f30718a81c0d056289dbddd428ead9802	3	image.png	image/png	510453	files/63/05/6305e02aab752972b2e46b1c49f4856f30718a81c0d056289dbddd428ead9802.png	orphaned	2026-03-13 12:03:02	2026-03-18 06:00:11
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

SELECT pg_catalog.setval('public.blackboards_id_seq', 857, true);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.branches_id_seq', 2, true);


--
-- Name: broadcast_boards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: yu
--

SELECT pg_catalog.setval('public.broadcast_boards_id_seq', 3, true);


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

SELECT pg_catalog.setval('public.files_id_seq', 5, true);


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

\unrestrict 7IKDkIRhQAmxo9yhyXYQUjabVJrLDPuYLP4otw5okHGClBQXaGDEXzGbRJmqkW9

