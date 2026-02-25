from datetime import datetime, timezone

from rich.console import Console
from rich.table import Table

console = Console()
error_console = Console(stderr=True)


def format_timestamp(ts: int | float) -> str:
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def print_user_info(user: dict) -> None:
    console.print(f"[bold]Handle:[/bold]  @{user.get('handle', 'N/A')}")
    console.print(f"[bold]Name:[/bold]    {user.get('displayName', 'N/A')}")
    console.print(f"[bold]Email:[/bold]   {user.get('email', 'N/A')}")
    console.print(f"[bold]Role:[/bold]    {user.get('role', 'user')}")


def print_search_results(results: list[dict]) -> None:
    table = Table(title="Search Results")
    table.add_column("Kind", style="cyan", width=6)
    table.add_column("Slug", style="green")
    table.add_column("Name")
    table.add_column("Summary", max_width=40)
    for r in results:
        table.add_row(r["kind"], r["slug"], r["displayName"], r.get("summary", ""))
    console.print(table)


def print_list_table(items: list[dict], kind: str) -> None:
    table = Table(title=f"{kind.title()}s")
    table.add_column("Slug", style="green")
    table.add_column("Name")
    table.add_column("Summary", max_width=40)
    table.add_column("DL", justify="right")
    table.add_column("Stars", justify="right")
    table.add_column("Updated")
    for item in items:
        stats = item.get("stats", {})
        table.add_row(
            item["slug"],
            item["displayName"],
            item.get("summary", ""),
            str(stats.get("downloads", 0)),
            str(stats.get("stars", 0)),
            format_timestamp(item["updatedAt"]) if item.get("updatedAt") else "",
        )
    console.print(table)


def print_detail(kind: str, detail: dict) -> None:
    console.print(f"\n[bold]{kind.title()}:[/bold] {detail['displayName']} ({detail['slug']})")
    owner = detail.get("owner")
    if owner:
        console.print(f"[bold]Owner:[/bold]   @{owner.get('handle', 'N/A')}")
    if detail.get("summary"):
        console.print(f"[bold]Summary:[/bold] {detail['summary']}")

    lv = detail.get("latestVersion")
    if lv:
        console.print(f"[bold]Version:[/bold] {lv['version']}")
        console.print(f"[bold]Published:[/bold] {format_timestamp(lv['createdAt'])}")
        if lv.get("changelog"):
            console.print(f"[bold]Changelog:[/bold] {lv['changelog']}")
        if lv.get("files"):
            console.print("[bold]Files:[/bold]")
            for f in lv["files"]:
                console.print(f"  - {f['path']} ({f['size']} bytes)")

    deps = detail.get("dependencies", {})
    skill_deps = deps.get("skills", [])
    role_deps = deps.get("roles", [])
    if skill_deps or role_deps:
        console.print("[bold]Dependencies:[/bold]")
        for d in skill_deps:
            console.print(f"  - skill: {d}")
        for d in role_deps:
            console.print(f"  - role: {d}")

    stats = detail.get("stats", {})
    console.print(
        f"[bold]Stats:[/bold] {stats.get('downloads', 0)} downloads, "
        f"{stats.get('stars', 0)} stars, "
        f"{stats.get('versions', 0)} versions"
    )


def print_error(message: str) -> None:
    error_console.print(f"[bold red]Error:[/bold red] {message}")


def print_success(message: str) -> None:
    console.print(f"[bold green]OK:[/bold green] {message}")
