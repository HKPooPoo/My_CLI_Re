host.docker.internal

docker ps -a
docker stop my-cli-postgres
docker rm my-cli-postgres

docker volume create my-cly-postgres-data

docker run --name my-cli-pgadmin -p 8080:80 -e "PGADMIN_DEFAULT_EMAIL=arrogance998@gmail.com" -e "PGADMIN_DEFAULT_PASSWORD=prejudice720917q" -d dpage/pgadmin4

docker run --name my-cli-postgres -e POSTGRES_USER=yu -e POSTGRES_PASSWORD=prejudice720917q -e POSTGRES_DB=my-cli-db -p 5431:5432 -v my-cly-postgres-data:/var/lib/postgresql -d postgres