FROM golang:1.23-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /src/backend
RUN go mod download
WORKDIR /src
COPY backend ./backend
COPY database ./database
WORKDIR /src/backend
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -o /out/migrate ../database/scripts/migrate.go
FROM alpine:3.21
RUN adduser -D -H app
USER app
COPY --from=build /out/api /api
COPY --from=build /out/migrate /migrate
COPY --from=build /src/database/migrations /database/migrations
EXPOSE 8080
ENTRYPOINT ["/api"]
