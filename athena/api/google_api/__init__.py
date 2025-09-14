# athena/api/google_api/__init__.py

from athena.api.google_api.devices import Devices
_internal_device_class = Devices()

class device:

    def reset(identifier):
        cls = _internal_device_class
        return cls.reset_device(identifier)

    def reboot(identifier, identifier_type='annotatedAssetId'):
        cls = _internal_device_class
        return cls.reboot_devices(identifier, identifier_type)

    def deprovision_device(identifier, target_ou):
        cls = _internal_device_class
        return cls.deprovision(identifier, target_ou)

    def get_wan_ip(identifier):
        cls = _internal_device_class
        return cls.find_device(identifier, 'annotatedAssetId', 'lastKnownNetwork.wanIpAddress')


    def get_device(identifier, *args):
        cls = _internal_device_class
        query = cls.find_device(identifier, 'annotatedAssetId', *args)
        if query == None:
            query = cls.find_device(identifier, 'serialNumber', *args)
        return query

    def move(devices, org_unit, identifier_type='annotatedAssetId'):
        cls = _internal_device_class
        return cls.move_devices_to_ou(devices, org_unit, identifier_type)

    def update(devices):
        cls = _internal_device_class
        return cls.update_os(devices)

class org_unit:

    def get_devices(org_unit=None, *args, max_results=10, recent_users_limit=None, formatted=False, include_null=False):
        cls = _internal_device_class
        return cls.list_devices_by_ou(org_unit, *args, max_results=max_results, recent_users_limit=recent_users_limit, formatted=formatted, include_null=include_null)

    def get_wan_ip(org_unit):
        data = []
        cls = _internal_device_class
        results = cls.list_devices_by_ou(org_unit, 'annotatedAssetId', 'lastKnownNetwork.wanIpAddress')
        for result in results:
            device = {
                "ASSET_TAG": result.get('annotatedAssetId'),
                "WAN": result.get('lastKnownNetwork.wanIpAddress')
            }
            data.append(device)
        return data

    def list_ous(formatted=False):
        """
        Get a list of all organizational units under '/Chromebooks'.

        Args:
            formatted (bool): Whether to return formatted JSON string or Python object.

        Returns:
            dict or str: Dictionary containing OU information or formatted JSON string.
        """
        cls = _internal_device_class
        return cls.list_organizational_units(formatted=formatted)
