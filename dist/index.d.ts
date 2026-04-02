declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: ({
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
