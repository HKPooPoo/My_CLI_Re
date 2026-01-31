# 1. Background Information
Project Name: My CLI
---

## Why are we developing this software?
Most of the modern personal information managers, such as Notion and NotebookLM, often embed with powerful features, such as LLM assistance and formatations, but require a stable Internet connection,  mandatory login, or native installation. That wasn't ideal for simple or instant agile tasks.

For example, many people get used to transmitting data from mobile and PC, but they often facing inconvenients on these situations:
1. **Fragmentation**: Chaotic message history with "Message Yourself"
2. **Session Limitations**: Temporarily need to fetch data from the third-party device (WhatsApp not allow simultanious login for more than two devices)
3. **Login Barriers**: Want to transmit data from public devices, such as school computers
4. **Offline Reliabilities**: Want to jot down a fleeting inspiration while offline

## What problem is it solving?
The conditions above should be reduce by the following reflection list:
1. **Fragmentation** <- **Message Manager**: Our project should offer a simple method for users to switch *note blocks* in a single button, such that user can start a new task or rollback the task without concerns of management
2. **Session Limitations** AND **Login Barriers** <- **Loose Account System**: Our project should not force users to login with binding contact methods, as long as they can access the Internet and cache the webpage, the basic features should be opened, and can be synced using the registered customized ***UID***
3. **Offline Reliabilities** <- **Offline-First Design**: The data is prioritized to be stored in localStorage, so that users can even jot notes offline after catching the webpage; users can synchronize the data afterward

## Who are my target?
People who need to constantly jot down fragmented information, such as time schedule and inspirations, as follows:
1. Students
2. Artists

## Deployment
1. When would you expect to deploy it?
2. How much does it cost?
   * **Money**
     * *Hardware*: 
     * *Software*: 
     * *Service*: 
     * *Manday*: 
   * **Time**: 

# 2. System Desccription
## What is the object we are developing?
***My CLI*** is a Web Application with the following attributes:
1. **Single Page App (SPA)**
   * One .html file as the only medium to present content, with page control navigation
2. **Progressive Web App (PWA)**
   * Allow offline access after the first access for ***Blackboard***, or even ***notice*** feature for ***Walkie-Typie***
3. **Account System**
   * Users can register by creating unique UID and passcode
   * Gmail is a optional, for ***Forgor Passcode*** feature by smtp.gmail.com service to send verification email and temporary passcode reset code
4. **Blackboard feature (Offline-First Personal Information Manager)**
   * It allows users to jot down notes with an easy organization method, similar to git version control (extremely lightweight), that allows users to either keep data on a local device with localStorage feature, or fetch/upload them using a database on the server:
     * Initially, a user will have 2 ***note*** containing 0 ***notes***
     * Each ***note*** can contain maximally 10 ***notes***; FIFO queue structure
     * Each ***notes*** can store text and binary files
     * Users can ***push*** to append a new blank ***notes*** to previous ***notes***
     * Users can ***pull*** to rollback previous ***notes*** to ***read*** OR ***update***
     * Users can access the database by login after registeration
     * Using database, users can choose to ***overwrite database data with localData*** OR ***overwrite localData with database data*** OR ***append localData to database data then overwrite localData***
5. **Walkie-Typie feature (Point-to-Point Texting)**
   * Users can pick connect object on ***List*** page, which lists all connected objects' ***UID*** and ***Last Signal*** (last seen)
   * Allow users to connect other users using ***UID***
   * It is a variant reusing the concept of ***Blackboard*** with same operation logic (***Push*** and ***Pull***), that creates a blackboard for both connectors on each connection
   * ***Text*** page contains ***Blackboards*** of each side, that allows users to text with others by ***AJAX Short Polling*** updating bilateral ***Blackboard***
6. **Broadcast feature (Public Read-Only Blackboard)**
   * Only users with higher level of permission can write
   * Every lower level of user can read the content
   * Suitable for music channel and news publication

# 3. Project Plan


# 4. Summary