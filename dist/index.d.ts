declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: ({
        name: string;
        permissionTier: "full";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "full";
        aliasOf: string;
    } | {
        name: string;
        permissionTier: "read-write";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "read-only";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "read-only";
        aliasOf: string;
    })[];
    readonly commandDir: string;
};
export default pkg;
