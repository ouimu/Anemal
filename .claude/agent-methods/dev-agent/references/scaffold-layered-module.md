# Scaffold Layered Module

**Skill Description:** Generates backend boilerplate following the required layered architecture.

## Instructions
1. When asked to implement a backend feature, generate code strictly adhering to this flow: Route → Controller → Service → Repository.
2. **Controllers** must be thin: Only parse requests, call the service, and return responses. No business logic.
3. **Services** contain business logic. No database calls directly.
4. **Repositories/Models** handle all DB interaction.
5. Ensure `tenantId` is extracted at the Controller level (via context from middleware) and passed down to the Service and Repository explicitely.
6. Enforce TypeScript strict mode, define interfaces for request/response shapes, and do not use `any`.
