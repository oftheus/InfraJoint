"""Erros de negócio. A tradução para HTTP acontece na borda, em main.py."""


class DomainError(Exception):
    """Base para tudo que o domínio sabe recusar."""


class NotFoundError(DomainError):
    """Recurso inexistente — ou existente e invisível para quem pediu.

    Os dois casos colapsam de propósito. A RLS devolve zero linhas quando a linha é
    de outro tenant, e responder 403 ali confirmaria que o id existe.
    """


class ForbiddenError(DomainError):
    """A identidade é conhecida, mas o papel não autoriza a operação."""
