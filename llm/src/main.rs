use axum::{body::Body, extract::Request, response::Response, routing::any, Router};
use reqwest::Client;
use std::env;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/{*path}", any(proxy))
        .route("/", any(proxy))
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:11434";
    println!("LLM proxy listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn proxy(req: Request) -> Response {
    let upstream = env::var("OLLAMA_UPSTREAM").unwrap_or_else(|_| "http://localhost:11435".into());
    let client = Client::new();

    let uri = format!("{}{}", upstream, req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/"));
    let method = req.method().clone();
    let headers = req.headers().clone();
    let body = axum::body::to_bytes(req.into_body(), usize::MAX).await.unwrap_or_default();

    let resp = client.request(method, &uri).headers(headers).body(body).send().await;

    match resp {
        Ok(r) => Response::builder()
            .status(r.status())
            .body(Body::from_stream(r.bytes_stream()))
            .unwrap(),
        Err(e) => Response::builder()
            .status(502)
            .body(Body::from(format!("Proxy error: {e}")))
            .unwrap(),
    }
}
