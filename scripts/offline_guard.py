"""Test-only nonloopback socket guard. Never used to change production behavior."""
import ipaddress
import socket


def is_loopback(host):
    if host is None or host == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def block_nonloopback(patch=None):
    connect, connect_ex, resolve = socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo
    def check(host):
        if not is_loopback(host):
            raise AssertionError('Offline QA blocked nonloopback network access')
    def guarded_connect(sock, address):
        if isinstance(address, tuple):
            check(address[0])
        return connect(sock, address)
    def guarded_connect_ex(sock, address):
        if isinstance(address, tuple):
            check(address[0])
        return connect_ex(sock, address)
    def guarded_resolve(host, *args, **kwargs):
        check(host)
        return resolve(host, *args, **kwargs)
    setter = patch.setattr if patch else setattr
    setter(socket.socket, 'connect', guarded_connect)
    setter(socket.socket, 'connect_ex', guarded_connect_ex)
    setter(socket, 'getaddrinfo', guarded_resolve)
